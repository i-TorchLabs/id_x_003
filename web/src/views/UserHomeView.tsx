'use client'

import { userAcitvityListApi, type UserAcitvity } from '@/api/user'
import { useUserStore } from '@/context/UserContext'
import CalendarComponent, { type CalendarComponentRef } from '@/components/aa/CalendarComponent'
import { activeColor, disabledColor, fullColor } from '@/utils/color'
import { Button, Chip, Input, Label, Pagination, Radio, RadioGroup, Table, TextField } from '@heroui/react'
import type { EventInput } from '@fullcalendar/core'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const RenderStatus = (state: string) => {
  if (state === '0') return <Chip>Closed</Chip>
  if (state === '1') return <Chip color="success">Open</Chip>
  return <Chip color="danger">Full</Chip>
}

const DEFAULT_ACTIVITY_VIEW = 'list'
const DEFAULT_CALENDAR_VIEW = 'timeGridWeek'

const activityViews = ['calendar', 'list']

const calendarViews = [
  {
    value: 'dayGridMonth',
    label: 'Month'
  },
  {
    value: 'timeGridWeek',
    label: 'Week'
  },
  {
    value: 'timeGridDay',
    label: 'Day'
  }
]

const columns = [
  { id: 'date', name: 'Date' },
  { id: 'time', name: 'Time' },
  { id: 'activity_name', name: 'Title' },
  { id: 'state', name: 'State' },
  { id: 'number', name: 'Occupied' },
  { id: 'actions', name: 'Options' }
]

export default function UserHomeView() {
  const userStore = useUserStore()
  const router = useRouter()

  const calendarRef = useRef<CalendarComponentRef>(null)
  const calendarApi = calendarRef.current?.calendarApi

  const [calendarTitle, setCalendarTitle] = useState('')
  const [calendarEvents, setCalendarEvents] = useState<EventInput[]>([])
  const [calendarDate, setCalendarDate] = useState<string | Date | undefined>(undefined)
  const [activityView, setActivityView] = useState(DEFAULT_ACTIVITY_VIEW)
  const [calendarView, setCalendarView] = useState(DEFAULT_CALENDAR_VIEW)

  const [formValue, setFormValue] = useState<{
    start_date?: string
    end_date?: string
    fuzzy_name?: string
  }>({
    start_date: undefined,
    end_date: undefined,
    fuzzy_name: undefined
  })

  const [dateReactive, setDateReactive] = useState({
    date: '',
    week: ''
  })

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<UserAcitvity[]>([])

  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    itemCount: 0
  })

  const isToday = useMemo(() => {
    switch (calendarView) {
      case 'dayGridMonth':
        return dayjs().isSame(dayjs(calendarDate), 'month')
      case 'timeGridWeek':
        return dayjs().isSame(dayjs(calendarDate), 'week')
      case 'timeGridDay':
        return dayjs().isSame(dayjs(calendarDate), 'day')
      default:
        return false
    }
  }, [calendarView, calendarDate])

  const toApply = (activityId: string) => {
    router.push(`/f/aa/user/activity?activity_id=${activityId}`)
  }

  const getData = useCallback(
    async (page: number, pageSize: number, view: string) => {
      setLoading(true)
      const { detail, date, week, total } = await userAcitvityListApi({
        ...formValue,
        user_id: userStore.state.userId,
        offset: page.toString(),
        limit: pageSize.toString()
      })
      setData(detail)
      setDateReactive({ date, week })
      setCalendarDate(date)
      calendarRef.current?.calendarApi?.gotoDate(dayjs(date).format('YYYY-MM-DD'))
      setPagination((p) => ({ ...p, itemCount: Number(total) }))
      setLoading(false)
      if (view === 'calendar') {
        setCalendarEvents(
          detail.map((item, index) => ({
            ...item,
            title: item.activity_name,
            start: item.start_time,
            end: item.end_time,
            color:
              item.state === '0'
                ? disabledColor(index)
                : item.state === '1'
                  ? activeColor(index)
                  : fullColor(index)
          })) as EventInput[]
        )
      }
    },
    [formValue, userStore.state.userId]
  )

  const handlePageChange = (page: number) => {
    if (loading) return
    setPagination((p) => ({ ...p, page }))
    getData(page, pagination.pageSize, activityView)
  }

  const handleSearchClick = () => {
    getData(pagination.page, pagination.pageSize, activityView)
  }

  const handleRecordClick = () => {
    router.push('/f/aa/user/activity/apply-record')
  }

  const gotoPrev = () => {
    calendarRef.current?.calendarApi?.prev()
    setCalendarDate(calendarRef.current?.calendarApi?.getDate())
  }

  const gotoNext = () => {
    calendarRef.current?.calendarApi?.next()
    setCalendarDate(calendarRef.current?.calendarApi?.getDate())
  }

  const gotoToday = () => {
    calendarRef.current?.calendarApi?.today()
    setCalendarDate(calendarRef.current?.calendarApi?.getDate())
  }

  const activityViewChange = (value: string) => {
    setActivityView(value)
    let pageSize = 10
    if (value === 'calendar') {
      pageSize = 99999
    } else {
      // 重置日历默认数据和页码
      setCalendarEvents([])
      setCalendarView(DEFAULT_CALENDAR_VIEW)
      pageSize = 10
    }
    setPagination((p) => ({ ...p, page: 1, pageSize }))
    getData(1, pageSize, value)
  }

  const calendarViewChange = (value: string) => {
    setCalendarView(value)
    calendarRef.current?.calendarApi?.changeView(value)
  }

  useEffect(() => {
    getData(1, 20, DEFAULT_ACTIVITY_VIEW)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalPages = Math.max(1, Math.ceil(pagination.itemCount / pagination.pageSize))

  return (
    <>
      <div className="mb-2 text-center bg-[#763890] text-[#fff] rounded-lg p-4">
        <span className="text-[24px]">SME Alumni Advising Program</span>
      </div>
      <div className="bg-[#fff] p-5 mb-2 pb-0 flex justify-between">
        <div className="flex flex-wrap items-end gap-4">
          <TextField
            value={formValue.start_date?.replace(' ', 'T') ?? ''}
            onChange={(v) =>
              setFormValue((f) => ({ ...f, start_date: v ? v.replace('T', ' ') : undefined }))
            }
          >
            <Label>Start Time</Label>
            <Input type="datetime-local" placeholder="Please Input Start Time" />
          </TextField>
          <TextField
            value={formValue.end_date?.replace(' ', 'T') ?? ''}
            onChange={(v) =>
              setFormValue((f) => ({ ...f, end_date: v ? v.replace('T', ' ') : undefined }))
            }
          >
            <Label>End Time</Label>
            <Input type="datetime-local" placeholder="Please Input End Time" />
          </TextField>
          {/* 增加根据名称，模糊筛选 */}
          <TextField
            value={formValue.fuzzy_name ?? ''}
            onChange={(v) => setFormValue((f) => ({ ...f, fuzzy_name: v || undefined }))}
          >
            <Label>Title</Label>
            <Input placeholder="Please Input Title" />
          </TextField>
          <Button onPress={handleSearchClick}>
            <span className="mr-1">🔍</span>
            Search
          </Button>
        </div>
        <Button variant="primary" onPress={handleRecordClick}>
          My Records
        </Button>
      </div>
      <div className="bg-[#fff] p-2 flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold">Date</span>
          <Chip color="accent">{dateReactive.date || '--'}</Chip>
          <Chip>{dateReactive.week ? `${dateReactive.week}` : '--'}</Chip>
        </div>
        <RadioGroup
          value={activityView}
          onChange={activityViewChange}
          orientation="horizontal"
          aria-label="Activity View"
        >
          {activityViews.map((view) => (
            <Radio className="capitalize" key={view} value={view}>
              {view}
            </Radio>
          ))}
        </RadioGroup>
      </div>
      {activityView === 'list' ? (
        <div className="bg-[#fff]">
          <Table aria-label="Activity List">
            <Table.ScrollContainer>
              <Table.Content aria-label="data table">
                <Table.Header columns={columns}>
                  {(col) => <Table.Column id={col.id}>{col.name}</Table.Column>}
                </Table.Header>
                <Table.Body
                  items={data}
                  renderEmptyState={() => <div className="p-4 text-center">No Data</div>}
                >
                  {(row) => (
                    <Table.Row id={row.activity_id}>
                      {(column: { id: string; name: string }) => {
                        switch (column.id) {
                          case 'date':
                            return <Table.Cell>{row.date}</Table.Cell>
                          case 'time':
                            return (
                              <Table.Cell>
                                {row.start_time_show + ' — ' + row.end_time_show}
                              </Table.Cell>
                            )
                          case 'activity_name':
                            return <Table.Cell>{row.activity_name}</Table.Cell>
                          case 'state':
                            return <Table.Cell>{RenderStatus(row.state)}</Table.Cell>
                          case 'number':
                            return <Table.Cell>{row.number + '/' + row.quota}</Table.Cell>
                          case 'actions':
                            return (
                              <Table.Cell>
                                <Button
                                  variant="primary"
                                  isDisabled={row.state !== '1'} // 当活动状态为“Closed/Full”，“Apply”按钮置灰
                                  onPress={() => toApply(row.activity_id)}
                                >
                                  Apply
                                </Button>
                              </Table.Cell>
                            )
                          default:
                            return <Table.Cell />
                        }
                      }}
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
          <div className="flex justify-end p-2">
            <Pagination aria-label="pagination">
              <Pagination.Summary>
                {pagination.page} / {totalPages}
              </Pagination.Summary>
              <Pagination.Content>
                <Pagination.Item>
                  <Pagination.Previous
                    onPress={() => handlePageChange(pagination.page - 1)}
                    isDisabled={pagination.page <= 1}
                  >
                    Previous
                  </Pagination.Previous>
                </Pagination.Item>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <Pagination.Item key={n}>
                    <Pagination.Link isActive={n === pagination.page} onPress={() => handlePageChange(n)}>
                      {n}
                    </Pagination.Link>
                  </Pagination.Item>
                ))}
                <Pagination.Item>
                  <Pagination.Next
                    onPress={() => handlePageChange(pagination.page + 1)}
                    isDisabled={pagination.page >= totalPages}
                  >
                    Next
                  </Pagination.Next>
                </Pagination.Item>
              </Pagination.Content>
            </Pagination>
          </div>
        </div>
      ) : (
        <div className="bg-[#fff]">
          <div className="flex items-center justify-between p-2">
            <div className="flex items-center">
              <Button variant="primary" isIconOnly onPress={gotoPrev} aria-label="Previous">
                ‹
              </Button>
              <Button variant="primary" isIconOnly onPress={gotoNext} aria-label="Next">
                ›
              </Button>
              <Button variant="primary" className="ml-2" isDisabled={isToday} onPress={gotoToday}>
                today
              </Button>
            </div>
            <span className="text-[24px] font-bold">{calendarTitle}</span>
            <RadioGroup
              value={calendarView}
              onChange={calendarViewChange}
              orientation="horizontal"
              aria-label="Calendar View"
            >
              {calendarViews.map((view) => (
                <Radio key={view.value} value={view.value}>
                  {view.label}
                </Radio>
              ))}
            </RadioGroup>
          </div>
          <div className={loading ? 'opacity-50 pointer-events-none' : ''}>
            <CalendarComponent
              ref={calendarRef}
              renderStatus={RenderStatus}
              calendarEvents={calendarEvents}
              calendarView={calendarView}
              onUpdateCalendarTitle={setCalendarTitle}
              onItemClick={(info) => toApply(info.activityId)}
            />
          </div>
        </div>
      )}
    </>
  )
}
