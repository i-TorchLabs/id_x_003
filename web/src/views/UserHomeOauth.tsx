'use client'

import { userAcitvityOauthApi } from '@/api/user'
import { useUserStore, type UserState } from '@/context/UserContext'
import { SITE_URL } from '@/utils/config'
import { OAUTH_STATE_KEY } from '@/utils/sso'
import { toast } from '@heroui/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function UserHomeOauth() {
  const router = useRouter()
  const userStore = useUserStore()

  useEffect(() => {
    // 直接解析 window.location.search（仅客户端执行，避免 useSearchParams 需 Suspense 包裹）
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')

    if (!code) {
      toast.danger('Invalid OAuth response: missing code')
      return
    }

    // CSRF 校验：state 必须与授权请求时生成并暂存的一致
    const savedState = sessionStorage.getItem(OAUTH_STATE_KEY)
    if (!savedState || savedState !== state) {
      toast.danger('Invalid OAuth response: state mismatch')
      return
    }
    sessionStorage.removeItem(OAUTH_STATE_KEY)

    userAcitvityOauthApi(code, state)
      .then((data) => {
        userStore
          .saveUser({
            ...data,
          } as UserState)
          .then(() => {
            if (data.check === 'true') {
              router.push('/f/aa/user/home')
            } else {
              window.location.href = `${SITE_URL}/s/aa/login`
            }
          })
      })
      .catch((error) => {
        toast.danger(error.message)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <p>No Authority</p>
    </div>
  )
}
