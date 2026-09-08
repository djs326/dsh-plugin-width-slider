/**
 * vitest 配置：沿用默认 include（test/**\/*.test.ts(x)），只排除仓库里
 * 参考源码目录（dsh-im-connect-main、my-dsh-plugins-main）——它们各自带
 * 测试，默认扫描会一并执行并大量失败。
 */
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'dsh-im-connect-main/**', 'my-dsh-plugins-main/**'],
  },
})
