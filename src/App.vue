<template>
  <div>
    <form
      ref="form"
      :action="action"
      method="POST"
      enctype="multipart/form-data"
      target="iframe"
    >
      <input ref="file" type="file" name="file" @change="selectFile" />
      <button type="button" @click="upload">上传</button>
      <button type="button" @click="stop">暂停</button>
      <button type="button" @click="upload">恢复</button>
    </form>
    <iframe name="iframe" style="display: none"> </iframe>
  </div>
</template>

<script>
const SIZE = 10 * 1024; //切片大小
const NUM = 100; // 并发限制数量
export default {
  name: "App",
  data() {
    return {
      action: "http://localhost:3000/form",
      isChunkUpload: true,
      fileData: null,
      chunkList: null,
      requestList: [],
      chunkListRequest: []
    };
  },
  methods: {
    //获取文件的值
    selectFile(e) {
      this.fileData = e.target.files[0];
    },
    //原生请求
    request({ url, method = "post", data, headers = {}, requestList }) {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
        Object.keys(headers).forEach((key) =>
          xhr.setRequestHeader(key, headers[key])
        );
        xhr.send(data);
        xhr.onload = (e) => {
          //将请求成功的切片从请求列表中删除
          if (requestList) {
            let index = requestList.indexOf(xhr);
            requestList.splice(index, 1);
          }
          resolve({
            data: e.target.response
          });
        };
        requestList?.push(xhr);
      });
    },
    upload() {
      //切片上传
      if (this.isChunkUpload) {
        this.request({
          url: "http://localhost:3000/verify",
          data: JSON.stringify({ filename: this.fileData.name })
        }).then((response) => {
          this.handleUpload(response);
        });
      } else {
        this.$refs.form.submit();
        this.clear();
      }
    },
    //生成文件切片
    createdFileChunk(file, size) {
      size = size || SIZE;
      let fileChunkList = [],
        pos = 0;
      while (pos < file.size) {
        fileChunkList.push({ file: file.slice(pos, pos + size) });
        pos += size;
      }
      return fileChunkList;
    },
    //
    async handleUpload(response) {
      if (!this.fileData) return;
      this.requestList = [];
      let fileChunkList = this.createdFileChunk(this.fileData);
      // let hash = this.createHash(fileChunkList);
      this.chunkList = fileChunkList.map(({ file }, index) => ({
        // filehash: hash,
        chunk: file,
        hash: this.fileData.name + "_" + index
      }));
      await this.uploadChunk(response);
    },
    //上传切片
    async uploadChunk(response) {
      let chunkListPromise = [];
      if (response) {
        response = JSON.parse(response.data).uploadedList;
      } else {
        response = [];
      }
      this.chunkListRequest = this.chunkList
        .filter((item) => !response.includes(item.hash))
        .map(({ chunk, hash }) => {
          let formData = new FormData();
          formData.append("chunk", chunk);
          formData.append("hash", hash);
          formData.append("filename", this.fileData.name);
          formData.append("count", this.chunkList.length);
          return { formData };
        });

      //并发限制 避免浏览器处理过多的http请求报错
      for (let i = 0; i < NUM; i++) {
        if (this.chunkListRequest.length > 0) {
          chunkListPromise.push(this.asyncFunc(this.chunkListRequest.shift()));
        }
      }
      await Promise.all(chunkListPromise); // 并发切片

      // if (response.length + chunkListRequest.length == this.chunkList.length) {
      await this.mergeRequest();
      // }
    },
    //合并切片请求
    async mergeRequest() {
      await this.request({
        url: "http://localhost:3000/merge",
        data: JSON.stringify({ filename: this.fileData.name, size: SIZE })
      }).then(() => {
        this.clear();
      });
    },
    asyncFunc(val) {
      return this.asyncHandle(val).then(() => {
        if (this.chunkListRequest.length > 0) {
          return this.asyncFunc(this.chunkListRequest.shift());
        }
      });
    },
    asyncHandle(val) {
      let { formData } = val;
      return this.request({
        url: "http://localhost:3000",
        data: formData,
        requestList: this.requestList
      });
    },
    //暂停上传
    stop() {
      this.requestList.forEach((xhr) => xhr?.abort());
      this.requestList = [];
    },
    //清除文件
    clear() {
      this.$refs.file.value = "";
    }
  }
};
</script>

<style></style>
