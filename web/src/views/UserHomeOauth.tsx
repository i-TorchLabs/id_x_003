'use client'

import { userAcitvityOauthApi } from '@/api/user'
import { useUserStore, type UserState } from '@/context/UserContext'
import { SITE_URL } from '@/utils/config'
import { toast } from '@heroui/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

export default function UserHomeOauth() {
  const router = useRouter()
  const userStore = useUserStore()
  const hashRef = useRef('')

  useEffect(() => {
    hashRef.current = window.location.hash

    const checkToken = () => {
      // 防御性解析：hash 中无 access_token 时直接提示，避免 TypeError
      const match = hashRef.current.match(/#access_token=([^&]+)/)
      if (!match) {
        toast.danger('Invalid OAuth response')
        return
      }
      userAcitvityOauthApi(match[1])
        .then((data) => {
          userStore
            .saveUser({
              ...data
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
    }

    // 监听hash变化
    const onHashChange = () => {
      hashRef.current = window.location.hash
    }
    window.addEventListener('hashchange', onHashChange)
    checkToken()
    return () => {
      window.removeEventListener('hashchange', onHashChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <p>No Authority</p>
    </div>
  )
}
