const process = require("child_process");
const ChildProcess = process.fork("./index.js");

ChildProcess.on("edit", err => {
  if (err !== 0) {
    process.fork("./auto.js");
  }
});
