const md5 = require("spark-md5");

/*
创建二进制数组
读取每个切片文件
将读取结果放入spark中生成md5
*/

self.onmessage(async(e) => {
  let chunkFileList = e.data;
  let spark = new md5.ArrayBuffer();

  await chunkFileList.map((chunk) => {
    let reader = new FileReader();
    reader.readAsArrayBuffer(chunk);
    reader.onload((e) => {
        spark.append(e.target.result);
    })
  });

  await self.postMessage(spark.end());
  self.close();

});
