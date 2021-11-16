const http = require("http");
const fs = require("fs");
const path = require("path");
const multiparty = require("multiparty");

const server = http.createServer();

const pathText = path.resolve(__dirname, "./text"); //获取创建的文件夹绝对路径

server.on("request", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url == "/merge") {
    //切片传输完成
    req.on("data", data => {
      data = JSON.parse(data);
      sortChunk(data); //排序合并切片

      console.log("file is upload success");

      res.statusCode = 200;
      res.end("file is upload success");
    });
  } else {
    const form = new multiparty.Form();
    form.parse(req, (err, fields, file) => {
      const { hash, filename } = fields;

      if (!fs.existsSync("text")) {
        //如果不存在文件夹则创建文件夹
        fs.mkdirSync("text");
      }

      const pathText = path.resolve(__dirname, "./text"); //获取创建的文件夹绝对路径

      const fileReadStream = fs.createReadStream(file.chunk[0].path); //创建切片文件的可读流

      const chunkPath = pathText + "\\" + hash[0];

      // fs.writeFileSync(chunkPath, "a"); //为每个切片创建可写空文件

      const fileWriteStram = fs.createWriteStream(chunkPath); //创建文件的可写流

      fileReadStream.pipe(fileWriteStram); //将切片文件通过管道写入到空文件中

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
  const filePath = path.resolve(__dirname, "./file") + "\\" + filename;
  // fs.writeFileSync(filePath);

  await mergeFileChunk(fileChunkList, filePath, size);
}

async function mergeFileChunk(fileChunkList, filePath, size) {
  await Promise.all(
    fileChunkList.map((chunkPath, index) => 
      pipeStream(
        pathText + "\\" + chunkPath,
        // 指定位置创建可写流
        fs.createWriteStream(filePath, {
          start: index * size,
          end: (index + 1) * size,
        })
      )
    )
  );
  console.log(fileChunkList);
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
