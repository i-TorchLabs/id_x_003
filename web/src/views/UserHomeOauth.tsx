'use client'

import { post, type Response } from '@/api/http'
import { userAcitvityOauth } from '@/api/url'
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
      post({
        url: userAcitvityOauth,
        data: {
          oauth_token: hashRef.current.split('#access_token=')[1].split('&token_type=')[0]
        }
      })
        .then(({ data }: Response) => {
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
