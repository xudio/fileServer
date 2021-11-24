const process = require("child_process");
const ChildProcess = process.fork("server/index.js");

ChildProcess.on("exit", err => {
  if (err !== 0) {
    process.fork("server/auto.js");
    console.log(err);
  }
});
