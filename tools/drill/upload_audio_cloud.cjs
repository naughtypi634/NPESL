#!/usr/bin/env node
/*
 * 把 Question Drill 的男女发音上传到微信云开发存储。
 *
 *   cd tools/drill
 *   npm install
 *   node upload_audio_cloud.cjs --env <云环境 ID> --key <代码上传密钥路径>
 *
 * 上传 apps/drill/audio/f → audio/f、audio/m → audio/m，共 5,872 个文件。
 * 完成后把云环境 ID 和文件 ID 前缀写进小程序的 config.js。
 *
 * 代码上传密钥：微信公众平台 → 开发管理 → 开发设置 → 小程序代码上传密钥。
 *
 * 如果脚本拿不到 bucket（例如换了 miniprogram-ci 版本），也可以在云开发
 * 控制台点任意音频文件复制「文件 ID」，再单独跑：
 *
 *   node upload_audio_cloud.cjs --env <云环境 ID> --config "cloud://xxx.yyy/audio/f/001e37b0ff89.mp3"
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const AUDIO_CANDIDATES = [
  path.join(ROOT, 'apps', 'drill', 'audio'),
  path.join(ROOT, 'docs', 'audio')
];
const AUDIO = AUDIO_CANDIDATES.find((dir) => fs.existsSync(dir)) || AUDIO_CANDIDATES[0];

// 小程序目录可能整体挪位置，先认已知位置，再退回全库唯一匹配。
const MINI_CANDIDATES = [
  path.join(ROOT, 'apps', 'phonics', 'miniprogram')
];

function findMini() {
  for (const dir of MINI_CANDIDATES) {
    if (fs.existsSync(path.join(dir, 'project.config.json'))) return dir;
  }
  const hits = [];
  for (const top of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!top.isDirectory() || ['build', 'design', '.venv', '.git', 'node_modules'].includes(top.name)) continue;
    const stack = [path.join(ROOT, top.name)];
    while (stack.length) {
      const dir = stack.pop();
      if (fs.existsSync(path.join(dir, 'miniprogram', 'project.config.json'))) {
        hits.push(path.join(dir, 'miniprogram'));
        break;
      }
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== 'node_modules') stack.push(path.join(dir, entry.name));
      }
    }
  }
  if (hits.length === 1) return hits[0];
  throw new Error(`找不到唯一的小程序目录（找到 ${hits.length} 个）`);
}

const MINI = findMini();
const APPID = 'wxfb269884c0f1df20';
const CATEGORIES = ['f', 'm'];

function parseArgs(argv) {
  const out = { concurrency: 5 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--env') out.env = argv[++i];
    else if (arg === '--key') out.key = argv[++i];
    else if (arg === '--config') out.config = argv[++i];
    else if (arg === '--concurrency') out.concurrency = Number(argv[++i]) || 5;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`不认识的参数：${arg}`);
  }
  return out;
}

function usage() {
  console.log(`用法：
  node upload_audio_cloud.cjs --env <云环境 ID> --key <代码上传密钥路径>
  node upload_audio_cloud.cjs --env <云环境 ID> --config <任意一个云文件 ID>
`);
}

function prefixFromFileId(fileId) {
  const match = /^(cloud:\/\/[^/]+)\/audio\//.exec(fileId || '');
  if (!match) throw new Error('文件 ID 应形如 cloud://<env>.<bucket>/audio/f/xxxx.mp3');
  return match[1];
}

function writeConfig(env, prefix) {
  const file = path.join(MINI, 'config.js');
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(/cloudEnv:\s*'[^']*'/, `cloudEnv: '${env}'`);
  text = text.replace(/audioBase:\s*'[^']*'/, `audioBase: '${prefix}'`);
  fs.writeFileSync(file, text, 'utf8');
  console.log(`\n已更新 ${path.relative(ROOT, file)}`);
  console.log(`  cloudEnv:  ${env}`);
  console.log(`  audioBase: ${prefix}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return 0;
  }
  if (!args.env) throw new Error('缺少 --env');

  if (args.config) {
    writeConfig(args.env, prefixFromFileId(args.config));
    console.log('\n接下来在开发者工具里重新预览/上传小程序即可。');
    return 0;
  }

  if (!args.key) throw new Error('缺少 --key（或用 --config 只写配置）');
  if (!fs.existsSync(args.key)) throw new Error(`密钥不存在：${args.key}`);

  let ci;
  try {
    ci = require('miniprogram-ci');
  } catch (err) {
    console.error('缺少 miniprogram-ci。先在本目录运行：npm install');
    return 1;
  }

  const project = new ci.Project({
    appid: APPID,
    type: 'miniProgram',
    projectPath: MINI,
    privateKeyPath: path.resolve(args.key),
    ignores: []
  });

  for (const voice of CATEGORIES) {
    const local = path.join(AUDIO, voice);
    if (!fs.existsSync(local)) throw new Error(`找不到音频目录：${local}`);
    console.log(`\n上传 ${voice} 声：${local}`);
    await ci.cloud.uploadStorage({
      project,
      env: args.env,
      path: local,
      remotePath: `audio/${voice}`,
      concurrency: args.concurrency
    });
  }

  let bucket = '';
  try {
    const helper = require('miniprogram-ci/dist/ci/cloud/utils');
    const { currentEnv } = await helper.initEnvironmentByProject(project, args.env);
    bucket = (currentEnv.storages && currentEnv.storages[0] && currentEnv.storages[0].bucket) || '';
  } catch (err) {
    console.warn('\n拿不到存储桶名：' + err.message);
  }

  if (!bucket) {
    console.log(`
音频已上传。请在云开发控制台点任意一个音频文件，复制「文件 ID」，
再运行下面的命令写入配置：

  node upload_audio_cloud.cjs --env ${args.env} --config "cloud://....../audio/f/xxxx.mp3"
`);
    return 0;
  }

  writeConfig(args.env, `cloud://${args.env}.${bucket}`);
  console.log('\n接下来在开发者工具里重新预览/上传小程序即可。');
  return 0;
}

main().then(
  (code) => process.exit(code || 0),
  (err) => {
    console.error('\n失败：' + err.message);
    process.exit(1);
  }
);
