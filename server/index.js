const http = require("http");
const fs = require("fs-extra");
const path = require("path");
const multiparty = require("multiparty");
const slog = require("single-line-log").stdout;
const inquirer = require("inquirer");

const server = http.createServer();

const fileDirPath = path.resolve(__dirname, "../file"); //获取创建的文件夹路径
const SAVEFILETIME = 5 * 60 * 1000; //服务器文件保存时间 1分钟

server.on("request", async (req, res) => {
  //处理跨域问题
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url == "/merge") {
    //合并切片请求
    req.on("data", async data => {
      data = JSON.parse(data);
      await handleChunk(data); //排序合并切片

      console.log(data.filename + " is upload success");

      //文件合并完成服务器返回的值
      const prompt = [
        {
          type: "input",
          message: "请输入文件上传后，服务器返回的值：",
          name: "name",
          default: 0,
        },
      ];

      inquirer.prompt(prompt).then(answer => {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            errCode: answer.name,
          })
        );
      });
    });
  } else if (req.url == "/") {
    //发送切片请求
    const form = new multiparty.Form();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.status = 500;
        // res.end("process file chunk failed");
        res.end(err);
        return;
      }
      const { hash, filename, count } = fields;

      //将切片移动到临时文件夹
      const chunkDirPath = path.resolve(__dirname, `../${filename}`);
      await fs.move(files.chunk[0].path, `${chunkDirPath}/${hash}`);

      await fs.readdir(chunkDirPath, (err, files) => {
        slog(progressBar("file is uploaded", 25, count, files.length));
      });

      res.statusCode = 200;
      res.end();
    });
  } else if (req.url == "/verify") {
    //验证并返回已经上传的切片
    req.on("data", async data => {
      data = JSON.parse(data);
      let filename = data.filename;
      res.end(
        JSON.stringify({
          uploadedList: await createUploadedList(filename),
        })
      );
    });
  } else if (req.url == "/form") {
    //不切片请求
    const form = new multiparty.Form();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.status = 500;
        res.end("process file chunk failed");
        return;
      }
      const { file } = files;

      await fs.move(file[0].path, `${fileDirPath}/${file[0].originalFilename}`);
      const prompt = [
        {
          type: "input",
          message: "请输入文件上传后，服务器返回的值：",
          name: "name",
          default: 0,
        },
      ];

      inquirer.prompt(prompt).then(answer => {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            errCode: answer.name,
          })
        );
      });
    });
  }
});
server.listen("3000", () => {
  console.log("正在监听3000端口");
});
//返回已经上传的切片
async function createUploadedList(filename) {
  const chunkDirPath = path.resolve(__dirname, `../${filename}`);
  return fs.existsSync(chunkDirPath) ? await fs.readdir(chunkDirPath) : [];
}

//排序切片
async function handleChunk(data) {
  const filename = data.filename;
  const chunkDirPath = path.resolve(__dirname, `../${filename}`);
  const fileChunkList = fs
    .readdirSync(chunkDirPath)
    .filter(name => name.match(new RegExp(filename)))
    .sort((a, b) => parseInt(a.split("_")[1]) - parseInt(b.split("_")[1]));

  if (!fs.existsSync(fileDirPath)) {
    //如果不存在文件夹则创建文件夹
    fs.mkdirSync(fileDirPath);
  }

  await mergeFileChunk(fileChunkList, filename);
}

//合并切片生成最终文件buffer
async function mergeFileChunk(fileChunkList, filename) {
  const chunkDirPath = path.resolve(__dirname, `../${filename}`);
  const buffers = [];
  fileChunkList.map(chunk => {
    const chunkPath = path.resolve(chunkDirPath, `./${chunk}`);
    let buffer = fs.readFileSync(chunkPath);
    buffers.push(buffer);
    fs.unlinkSync(chunkPath);
  });

  let concatBuffer = Buffer.concat(buffers);
  let concatFilePath = path.resolve(fileDirPath, filename);
  fs.writeFileSync(concatFilePath, concatBuffer);
  //删除合并后的切片文件夹
  await fs.readdir(chunkDirPath, (err, files) => {
    if (files.length == 0) {
      fs.rmdirSync(chunkDirPath);
    }
  });
}

//检查文件创建时间是否超时 超时则删除
function checkFileTime() {
  if (fs.existsSync(fileDirPath)) {
    let birthTime = "",
      dir = "";
    fs.readdir(fileDirPath, (err, files) => {
      if (err) {
        console.log(err);
        return;
      }

      files.forEach(filename => {
        dir = path.resolve(fileDirPath, filename);
        fs.stat(dir, async (err, stats) => {
          if (err) {
            console.log(err);
            return;
          }
          birthTime = stats.birthtime;
          if (Date.parse(new Date()) - Date.parse(birthTime) > SAVEFILETIME) {
            await fs.unlinkSync(dir);
            console.log(filename + " is delete");
          }
        });
      });
    });
  }
}
//进度条
function progressBar(description, barWidth, count, uploaded) {
  let str = description + " " + parseInt(uploaded / count * 100) + "% [",
    index = 0;
  while (index < barWidth) {
    if (index < parseInt(uploaded / count * barWidth)) {
      str += "=";
    } else {
      str += " ";
    }
    index++;
  }
  str = str + "] " + uploaded + "/" + count + "\n";
  return str;
}
//初始化
function init() {
  checkFileTime();
  setInterval(checkFileTime, 1000);
}
init();
