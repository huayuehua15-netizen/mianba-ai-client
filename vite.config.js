import { defineConfig, loadEnv } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

// 小程序构建不支持 import.meta.env，这里在构建期把接口地址注入成全局常量
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    define: {
      __API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL || ''),
      __API_BASE_URL_DEV__: JSON.stringify(env.VITE_API_BASE_URL_DEV || 'http://127.0.0.1:3100/api/v1')
    },
    plugins: [uni()],
    resolve: {
      alias: {
        '@': '/src'
      }
    }
  }
})
