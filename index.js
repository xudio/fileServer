const http = require("http");
const fs = require("fs-extra");
const path = require("path");
const multiparty = require("multiparty");
const slog = require("single-line-log").stdout;
const inquirer = require("inquirer");
const process = require("process");

const server = http.createServer();

// const chunkDirPath = path.resolve(__dirname, "./text"); //获取创建的切片文件夹绝对路径
const fileDirPath = path.resolve(__dirname, "./file"); //获取创建的文件夹绝对路径
const SAVEFILETIME = 1 * 60 * 1000; //服务器文件保存时间 1分钟

server.on("request", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url == "/merge") {
    //切片传输完成
    req.on("data", async data => {
      data = JSON.parse(data);
      await handleChunk(data); //排序合并切片

      console.log(data.filename + " is upload success");

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
    const form = new multiparty.Form();
    form.parse(req, async (err, fields, file) => {
      if (err) {
        res.status = 500;
        res.end("process file chunk failed");
        return;
      }
      const { hash, filename, count } = fields;

      if (!fs.existsSync(`${filename}`)) {
        //如果不存在文件夹则创建文件夹
        fs.mkdirSync(`${filename}`);
      }

      const chunkDirPath = path.resolve(__dirname, `./${filename}`);
      await fs.move(file.chunk[0].path, `${chunkDirPath}/${hash}`);

      await fs.readdir(`${filename}`, (err, files) => {
        slog(progressBar("file is uploaded", 25, count, files.length));
      });

      // console.log(hash[0] + " upload is success");

      res.statusCode = 200;
      res.end(hash + " upload is success");
    });
  } else if (req.url == "/verify") {
    req.on("data", async data => {
      data = JSON.parse(data);
      let filename = data.filename;
      res.end(
        JSON.stringify({
          uploadedList: await createUploadedList(filename),
        })
      );
    });
  }
});
server.listen("3000", () => {
  console.log("正在监听3000端口");
});

process.on("uncaughtException", err => {
  console.log("This is a error:" + err);
});
async function createUploadedList(filename) {
  const chunkDirPath = path.resolve(__dirname, `./${filename}`);
  return fs.existsSync(chunkDirPath) ? await fs.readdir(chunkDirPath) : [];
}
async function handleChunk(data) {
  const filename = data.filename;
  const size = data.size;
  const chunkDirPath = path.resolve(__dirname, `./${filename}`);
  const fileChunkList = fs
    .readdirSync(chunkDirPath)
    .filter(name => name.match(new RegExp(filename)))
    .sort((a, b) => parseInt(a.split("_")[1]) - parseInt(b.split("_")[1]));

  if (!fs.existsSync("file")) {
    //如果不存在文件夹则创建文件夹
    fs.mkdirSync("file");
  }
  const filePath = path.resolve(fileDirPath, `./${filename}`);

  await mergeFileChunk(fileChunkList, filePath, size, filename);
}

async function mergeFileChunk(fileChunkList, filePath, size, filename) {
  const chunkDirPath = path.resolve(__dirname, `./${filename}`);
  await Promise.all(
    fileChunkList.map((chunkPath, index) =>
      pipeStream(
        path.resolve(chunkDirPath, `./${chunkPath}`),
        // 指定位置创建可写流
        fs.createWriteStream(filePath, {
          start: index * size,
          end: (index + 1) * size,
        })
      )
    )
  ).then(() => {
    fs.rmdirSync(chunkDirPath, err => {
      console.log(err);
    }); // 合并后删除保存切片的目录
  });
}

const pipeStream = (path, writeStream) =>
  new Promise(resolve => {
    const readStream = fs.createReadStream(path);
    readStream.on("end", () => {
      fs.unlinkSync(path);
      resolve();
    });
    readStream.pipe(writeStream);
  });

//检查文件创建时间是否超时 超时则删除
function checkFileTime() {
  if (fs.existsSync("file")) {
    let birthTime = "",
      dir = "";
    fs.readdir("./file", (err, files) => {
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
