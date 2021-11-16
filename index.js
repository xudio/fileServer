const http = require("http");
const fs = require("fs-extra");
const path = require("path");
const multiparty = require("multiparty");

const server = http.createServer();

const pathText = path.resolve(__dirname, "./text"); //获取创建的文件夹绝对路径
const filePath = path.resolve(__dirname, "./file"); //获取创建的文件绝对路径
const SAVEFILETIME = 1 * 60 * 1000; //服务器文件保存时间

server.on("request", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url == "/merge") {
    //切片传输完成
    req.on("data", async data => {
      data = JSON.parse(data);
      await sortChunk(data); //排序合并切片

      console.log("file is upload success");

      res.statusCode = 200;
      res.end("file is upload success");
    });
  } else if (req.url == "/") {
    const form = new multiparty.Form();
    form.parse(req, async (err, fields, file) => {
      const { hash, filename } = fields;

      if (!fs.existsSync("text")) {
        //如果不存在文件夹则创建文件夹
        fs.mkdirSync("text");
      }

      await fs.move(file.chunk[0].path, `${pathText}/${hash}`);

      console.log(hash[0] + " upload is success");

      res.statusCode = 200;
      res.end("chunk upload is success");
    });
  }
});

async function sortChunk(data) {
  const filename = data.filename;
  const size = data.size;
  const fileChunkList = fs
    .readdirSync(pathText)
    .filter(name => name.match(new RegExp(filename)))
    .sort((a, b) => parseInt(a.split("_")[1]) - parseInt(b.split("_")[1]));

  if (!fs.existsSync("file")) {
    //如果不存在文件夹则创建文件夹
    fs.mkdirSync("file");
  }
  const filePath = path.resolve(__dirname, "./file", `./${filename}`);

  await mergeFileChunk(fileChunkList, filePath, size);
}

async function mergeFileChunk(fileChunkList, filePath, size) {
  await Promise.all(
    fileChunkList.map((chunkPath, index) =>
      pipeStream(
        path.resolve(pathText, `./${chunkPath}`),
        // 指定位置创建可写流
        fs.createWriteStream(filePath, {
          start: index * size,
          end: (index + 1) * size,
        })
      )
    )
  );
  fs.rmdirSync(pathText); // 合并后删除保存切片的目录
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

server.listen("3000", () => {
  console.log("正在监听3000端口");
});

//初始化
function init() {
  checkFileTime();
  setInterval(checkFileTime, 1000);
}
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
        dir = path.resolve(filePath, filename);
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
init();
