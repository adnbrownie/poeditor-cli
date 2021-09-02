const utils = require("../lib/utils"),
  chalk = require("chalk"),
  api = require("../lib/api"),
  querystring = require("querystring"),
  util = require("util"),
  fs = require("fs"),
  ora = require("ora"),
  globby = require("globby"),
  promiseSeries = require("promise.series"),
  child_process = require("child_process"),
  transformer = require("../lib/transformer"),
  path = require("path"),
  FormData = require("form-data");

const cwd = process.cwd();
const fileTypeMap = {
  apple_strings: "strings",
  android_strings: "xml",
  key_value_json: "json",
};
let spinner = null;

function push() {
  const configUrl = path.resolve(cwd, "poeditor-config.json");

  if (!utils.isExist(configUrl)) {
    console.log(chalk.red(`\n 😭  poeditor-config.json required ~~~\n`));
    process.exit(0);
  }

  const config = require(configUrl);

  if (process.env.PO_APITOKEN) {
    config.apiToken = process.env.PO_APITOKEN;
  }

  if (!config.apiToken) {
    console.log(
      chalk.red(
        `\n API-Token not set! Most be provided in poeditor-config.json or env as "PO_APITOKEN" ~~~\n`
      )
    );
    process.exit(0);
  }

  const paths = globby.sync([config.targetDir]);

  spinner = ora(
    `${chalk.green(
      `Pushing file(s) to poeditor, approximately costs ${paths.length * 30}s`
    )}`
  ).start();

  try {
    putTermFiles(config);
  } catch (err) {
    console.log(err);
  }
}

async function putTermFiles(config) {
  const targetDir = path.resolve(cwd, config.targetDir);
  const paths = await globby([targetDir]);
  const sleep = (func, timeout) => {
    return new Promise(async (resolve) => {
      setTimeout(() => {
        func && func();
        resolve();
      }, timeout);
    });
  };

  const promises = paths.map((url, index) => {
    return new Promise(async (resolve, reject) => {
      let timeout = index * 30000 + 10;
      return sleep(async () => {
        if (path.parse(url).ext.slice(1) !== fileTypeMap[config.fileType]) {
          console.log(
            chalk.red(
              `\n 😭  Incorrect fileType, ${
                fileTypeMap[config.fileType] || config.fileType
              } file required ~~~\n`
            )
          );
          process.exit(0);
        }

        try {
          await putTermFile({
            ...config,
            file: url,
            language: path.parse(url).name,
          });
          resolve(null);
        } catch (err) {
          console.log("reject", err.message);
          reject(err);
        }
      }, timeout);
    });
  });

  Promise.all(promises)
    .then((res) => {
      spinner.stop();
      console.log(`🥝  ${chalk.cyan(`All file(s) uploaded ~~~`)}`);
    })
    .catch((err) => {
      spinner.stop();
      console.log(chalk.red(`\n 😭  Error occurred ${err.message} ~~~\n`));
      process.exit(1);
    });
}

async function putTermFile(config) {
  var formData = new FormData();
  formData.append("api_token", config.apiToken);
  formData.append("id", config.projectId);
  formData.append("language", config.language);
  formData.append("updating", "terms_translations");
  formData.append("file", fs.createReadStream(config.file));
  formData.append("overwrite", "1");
  
  if (config.syncTerms && config.sourceLang && config.language === config.sourceLang) {
    formData.append('sync_terms', '1');
  }

  if (config.pushParams) {
    Object.keys(config.pushParams)
      .forEach(paramName => formData.set(paramName, config.pushParams[paramName]))
  }

  const res = await api.post("/projects/upload", formData, {
    headers: {
      "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
    },
  });

  if (res.data.response.code === "200") {
    console.log(`🥝  Uploaded ${config.file} for ${config.language} completed`);
    return null;
  }

  let message = "";
  if (res.data && res.data.response) {
    message = `${res.data.response.code} ${res.data.response.message}`;
  }

  throw new Error(message);
}

module.exports = push;
