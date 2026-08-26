'use client'

import { userAcitvityApplyApi, userAcitvitySearchApi, type UserAcitvitySearchRes } from '@/api/user'
import { useUserStore } from '@/context/UserContext'
import { Button, Card, Chip, Radio, RadioGroup, toast } from '@heroui/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { sanitizeHtml } from '@/utils/sanitize'
import { useCallback, useEffect, useState } from 'react'

export default function UserApplyView() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const userStore = useUserStore()

  const [radioValue, setRadioValue] = useState('')

  const [data, setData] = useState<UserAcitvitySearchRes>({
    activity_name: '',
    activity_content: '',
    date: '',
    week: '',
    start_time: '',
    end_time: '',
    state: '',
    detail: {}
  })

  const handleRecordClick = () => {
    router.push('/f/aa/user/activity/apply-record')
  }

  const getData = useCallback(async () => {
    const activityId = searchParams.get('activity_id')
    if (activityId) {
      const res = await userAcitvitySearchApi({
        activity_id: Number(activityId)
      })
      setData({
        ...res,
        detail: res.detail
      })
    }
  }, [searchParams])

  const handleSubmit = async () => {
    try {
      await userAcitvityApplyApi({
        user_id: Number(userStore.state.userId),
        activity_id: Number(searchParams.get('activity_id')),
        detail: {
          info: radioValue
        }
      })
      toast.success('Success', { description: 'Apply successfully!' })
    } catch (error) {
      toast.danger('Tips', { description: (error as Error).message })
    }
  }

  useEffect(() => {
    getData()
  }, [getData])

  return (
    <>
      <div className="bg-[#fff] p-5 mb-2 flex justify-end">
        <Button variant="primary" onPress={handleRecordClick}>
          My Records
        </Button>
      </div>
      <div className="bg-[#fff]">
        <div className="font-bold text-[32px] flex justify-center">{data.activity_name}</div>
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.activity_content) }} className="p-5"></div>
      </div>
      <div className="bg-[#fff] p-2 mt-2 flex items-center gap-2">
        <span className="font-bold">Date</span>
        <Chip color="accent">{data.date || '--'}</Chip>
        <Chip>{data.week ? `${data.week}` : '--'}</Chip>
        {data.state === '0' ? (
          <Chip>Closed</Chip>
        ) : data.state === '1' ? (
          <Chip color="success">Open</Chip>
        ) : (
          <Chip color="danger">Full</Chip>
        )}
      </div>
      {data.state === '1' ? (
        <Card className="mt-2">
          <Card.Content>
            <RadioGroup value={radioValue} onChange={setRadioValue} aria-label="Apply Options">
              {Object.entries(data.detail).map(([key, item]) => (
                <div key={key}>
                  <div className="font-bold text-[18px]">{key}</div>
                  {Object.entries(item).map(([topic, topicItems]) => (
                    <div className="p-2" key={topic}>
                      <div>{topic}</div>
                      {topicItems.map((opt) => (
                        <Radio
                          key={opt.item}
                          value={opt.item}
                          isDisabled={opt.state === 'disable'}
                        >
                          {opt.item}
                        </Radio>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </RadioGroup>
          </Card.Content>
          <Card.Footer>
            <div className="flex justify-center w-full">
              <Button variant="primary" className="w-[120px]" onPress={handleSubmit}>
                Submit
              </Button>
            </div>
          </Card.Footer>
        </Card>
      ) : (
        <Card className="mt-2 bg-blue-300">
          <Card.Content>#</Card.Content>
        </Card>
      )}
    </>
  )
}
