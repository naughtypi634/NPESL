// Question Drill 的发音托管在云开发存储里，这里填云环境信息。
//
// cloudEnv：开发者工具 → 云开发 → 设置 → 环境 ID
// audioBase：云存储文件 ID 的前缀，形如 cloud://<envId>.<bucket>
//            在云开发控制台点任意一个音频文件，复制「文件 ID」，
//            取 /audio 之前的部分。
//
// 两项都留空时，Question Drill 正常可用，只是不显示发音按钮。

module.exports = {
  cloudEnv: '',
  audioBase: ''
};
