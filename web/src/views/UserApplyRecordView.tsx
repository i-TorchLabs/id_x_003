'use client'

import { userAcitvityDeleteApi, userAcitvityDetailApi, type UserAcitvityDetail } from '@/api/user'
import { useUserStore } from '@/context/UserContext'
import { AlertDialog, Button, Pagination, Table, toast } from '@heroui/react'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

const columns = [
  { id: 'order', name: 'Form No.' },
  { id: 'time', name: 'Applied Time' },
  { id: 'name', name: 'Acitvity Name' },
  { id: 'start_time', name: 'Start Time' },
  { id: 'end_time', name: 'End Time' },
  { id: 'state', name: 'State' },
  { id: 'message', name: 'Detail' },
  { id: 'options', name: 'Options' }
]

export default function UserApplyRecordView() {
  const userStore = useUserStore()

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<UserAcitvityDetail[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    itemCount: 0
  })

  const getData = useCallback(
    async (page: number) => {
      setLoading(true)
      const { detail, total } = await userAcitvityDetailApi({
        user_id: userStore.state.userId,
        offset: page.toString(),
        limit: pagination.pageSize.toString()
      })
      setData(detail)
      setPagination((p) => ({ ...p, itemCount: Number(total) }))
      setLoading(false)
    },
    [userStore.state.userId, pagination.pageSize]
  )

  const handlePageChange = (page: number) => {
    if (loading) return
    setPagination((p) => ({ ...p, page }))
    getData(page)
  }

  const doCancel = async (row: UserAcitvityDetail) => {
    try {
      await userAcitvityDeleteApi({
        apply_id: row.apply_id,
        user_id: userStore.state.userId
      })
      getData(pagination.page)
    } catch (error) {
      toast.danger('Tips', { description: (error as Error).message })
    }
  }

  useEffect(() => {
    getData(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalPages = Math.max(1, Math.ceil(pagination.itemCount / pagination.pageSize))

  return (
    <div className="bg-[#fff]">
      <Table aria-label="Apply Records">
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
                <Table.Row id={row.apply_id}>
                  {(column: { id: string; name: string }) => {
                    if (column.id === 'options') {
                      return (
                        <Table.Cell>
                          {/* 增加“取消/Cancel”按钮，活动时间前 4 小时，按钮置灰 */}
                          <AlertDialog>
                            <AlertDialog.Trigger>
                              <Button isDisabled={dayjs().add(4, 'hour').isAfter(row.end_time)}>
                                Cancel
                              </Button>
                            </AlertDialog.Trigger>
                            <AlertDialog.Backdrop>
                              <AlertDialog.Container placement="center">
                                <AlertDialog.Dialog>
                                  <AlertDialog.Header>
                                    <AlertDialog.Icon status="warning" />
                                    <AlertDialog.Heading>Cancel Activity</AlertDialog.Heading>
                                  </AlertDialog.Header>
                                  <AlertDialog.Body>
                                    Are you sure to cancel this activity?
                                  </AlertDialog.Body>
                                  <AlertDialog.Footer>
                                    <AlertDialog.CloseTrigger>
                                      <Button variant="ghost">No</Button>
                                    </AlertDialog.CloseTrigger>
                                    <AlertDialog.CloseTrigger>
                                      <Button variant="danger" onPress={() => doCancel(row)}>
                                        Yes
                                      </Button>
                                    </AlertDialog.CloseTrigger>
                                  </AlertDialog.Footer>
                                </AlertDialog.Dialog>
                              </AlertDialog.Container>
                            </AlertDialog.Backdrop>
                          </AlertDialog>
                        </Table.Cell>
                      )
                    }
                    return (
                      <Table.Cell>{String(row[column.id as keyof UserAcitvityDetail])}</Table.Cell>
                    )
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
  )
}
