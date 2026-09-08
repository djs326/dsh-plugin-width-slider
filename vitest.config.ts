/**
 * vitest 配置：只跑本项目 test/ 下的用例。
 * 仓库里带有若干参考源码目录（dsh-im-connect-main、my-dsh-plugins-main），
 * 它们各自带测试，默认扫描会一并执行并大量失败。
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
