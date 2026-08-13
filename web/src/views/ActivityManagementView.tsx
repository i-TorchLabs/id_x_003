"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  Button,
  Calendar,
  Chip,
  DatePicker,
  Form,
  Label,
  Modal,
  Pagination,
  Table,
  toast,
} from "@heroui/react";
import { DateInputGroup } from "@heroui/react/date-input-group";
import { getLocalTimeZone, type DateValue } from "@internationalized/date";
import dayjs from "dayjs";
import { download } from "@/utils/download";
import {
  adminActivityListApi,
  adminActivityUpdateApi,
  adminActivitySearchApi,
  adminActivityCreateApi,
  adminActivityDeleteApi,
  type AdminActivityListRes,
  type AdminActivityUpdateReq,
  type AdminActivityCreateReq,
} from "@/api/admin";
import { adminActivityDownload, baseAddress } from "@/api/url";
import { post } from "@/api/http";
import { useUserStore } from "@/context/UserContext";
import ActivityForm, {
  type ActivityFormRef,
  type ActivityFormValue,
} from "@/components/aa/ActivityForm";

const dateValueToStr = (value: DateValue | null): string | undefined =>
  value
    ? dayjs(value.toDate(getLocalTimeZone())).format("YYYY-MM-DD HH:mm")
    : undefined;

function SearchDatePicker({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: DateValue | null;
  onChange: (value: DateValue | null) => void;
}) {
  return (
    <DatePicker granularity="minute" value={value} onChange={onChange} aria-label={label}>
      <Label>{label}</Label>
      <DatePicker.Trigger>
        <DateInputGroup>
          <DateInputGroup.Input aria-label={placeholder}>
            {(segment) => <DateInputGroup.Segment segment={segment} />}
          </DateInputGroup.Input>
          <DateInputGroup.Suffix>
            <DatePicker.TriggerIndicator />
          </DateInputGroup.Suffix>
        </DateInputGroup>
      </DatePicker.Trigger>
      <DatePicker.Popover>
        <Calendar aria-label={label}>
          <Calendar.Header>
            <Calendar.NavButton slot="previous" />
            <Calendar.Heading />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>
              {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
            </Calendar.GridHeader>
            <Calendar.GridBody>
              {(date) => <Calendar.Cell date={date} />}
            </Calendar.GridBody>
          </Calendar.Grid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  );
}

interface ModalState {
  isEdit: boolean;
  activityId: string;
  initialValue?: Partial<ActivityFormValue>;
}

export default function ActivityManagementView() {
  const userStore = useUserStore();

  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState<DateValue | null>(null);
  const [endDate, setEndDate] = useState<DateValue | null>(null);
  const [uploadMsg, setUploadMsg] = useState({ success: 0, fail: 0 });
  const [page, setPage] = useState(1);
  const [itemCount, setItemCount] = useState(0);
  const pageSize = 20;
  const [data, setData] = useState<AdminActivityListRes[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalState, setModalState] = useState<ModalState>({
    isEdit: false,
    activityId: "",
  });
  const [deleteTarget, setDeleteTarget] =
    useState<AdminActivityListRes | null>(null);
  const activityFormRef = useRef<ActivityFormRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getData = useCallback(
    async (pageNo = page) => {
      setLoading(true);
      let result: AdminActivityListRes[] = [];
      try {
        const res = await adminActivityListApi({
          user_id: userStore.state.userId,
          offset: pageNo.toString(),
          limit: pageSize.toString(),
          start_date: dateValueToStr(startDate),
          end_date: dateValueToStr(endDate),
        });
        result = res.detail;
        setItemCount(Number(res.total));
      } catch {
        toast.danger("Fail to load data.");
      }
      setData(result || []);
      setLoading(false);
    },
    [page, startDate, endDate, userStore.state.userId]
  );

  useEffect(() => {
    getData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchClick = () => {
    getData();
  };

  const handlePageChange = (newPage: number) => {
    if (loading) return;
    setPage(newPage);
    getData(newPage);
  };

  const openModal = async (isEdit = false, activityId = "") => {
    if (isEdit) {
      const activityFormData = await adminActivitySearchApi({
        activity_id: activityId,
      });
      setModalState({
        isEdit,
        activityId,
        initialValue: {
          ...activityFormData,
          apply_start_time: new Date(
            activityFormData.apply_start_time
          ).getTime(),
          apply_end_time: new Date(activityFormData.apply_end_time).getTime(),
          activity_start_time: new Date(
            activityFormData.activity_start_time
          ).getTime(),
          activity_end_time: new Date(
            activityFormData.activity_end_time
          ).getTime(),
        } as Partial<ActivityFormValue>,
      });
    } else {
      setModalState({ isEdit, activityId, initialValue: undefined });
    }
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const formValue = (activityFormRef.current?.formValue || {}) as Record<
      string,
      any
    >;
    const {
      activity_start_time,
      activity_end_time,
      apply_start_time,
      apply_end_time,
    } = formValue;
    if (activity_start_time > activity_end_time) {
      toast.danger(
        '"activity_start_time" later than "activity_end_time" is forbiden!'
      );
      return;
    }
    if (apply_start_time > apply_end_time) {
      toast.danger(
        '"apply_start_time" later than "apply_end_time" is forbiden!'
      );
      return;
    }
    const reqData = {
      ...activityFormRef.current?.formValue,
    } as unknown as AdminActivityCreateReq & { activity_id?: string };
    if (modalState.isEdit) {
      reqData.activity_id = modalState.activityId;
      await adminActivityUpdateApi(reqData as AdminActivityUpdateReq);
    } else {
      await adminActivityCreateApi(reqData as AdminActivityCreateReq);
    }
    setModalOpen(false);
    getData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await adminActivityDeleteApi({
      activity_id: deleteTarget.activity_id,
    });
    getData();
  };

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("user_id", userStore.state.userId);
    try {
      const res = await post({
        url: "/manage/activity/upload",
        data: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      setUploadMsg(res.data);
      setPage(1);
      await getData(1);
    } catch (error) {
      toast.danger((error as Error).message);
    }
  };

  const handleDownloadClick = () => {
    download(`${baseAddress}${adminActivityDownload}`);
  };

  const totalPages = Math.max(1, Math.ceil(itemCount / pageSize));

  const columns = [
    { id: "project_name", name: "Title" },
    { id: "quota", name: "Offered" },
    { id: "number", name: "Occupied" },
    { id: "activity_start_time", name: "Start Time" },
    { id: "activity_end_time", name: "End Time" },
    { id: "apply_start_time", name: "App Start Time" },
    { id: "apply_end_time", name: "App End Time" },
    { id: "apply_link", name: "Address" },
    { id: "apply_detail", name: "Detail" },
    { id: "actions", name: "Options" },
  ];

  return (
    <div>
      <div className="bg-[#fff] mb-2 pb-5">
        <div className="flex justify-between p-5 pb-0">
          <Form
            className="flex flex-row items-end gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchClick();
            }}
          >
            <SearchDatePicker
              label="Start Time"
              placeholder="Please Input Start Time"
              value={startDate}
              onChange={setStartDate}
            />
            <SearchDatePicker
              label="End Time"
              placeholder="Please Input End Time"
              value={endDate}
              onChange={setEndDate}
            />
            <Button type="submit" onPress={handleSearchClick}>
              Search
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="primary"
              onPress={() => fileInputRef.current?.click()}
            >
              Upload
            </Button>
            <Button onPress={handleDownloadClick}>Download Template</Button>
          </Form>
          <Button variant="primary" onPress={() => openModal(false)}>
            Add
          </Button>
        </div>
        {!!uploadMsg.success && (
          <Chip color="success" className="ml-5 mt-2">
            Upload Success: {uploadMsg.success}
          </Chip>
        )}
        {!!uploadMsg.fail && (
          <Chip color="danger" className="ml-5 mt-2">
            Upload Fail: {uploadMsg.fail}
          </Chip>
        )}
      </div>

      <Table aria-label="Activity list">
        <Table.ScrollContainer>
          <Table.Content aria-label="data table">
            <Table.Header columns={columns}>
              {(col) => <Table.Column id={col.id}>{col.name}</Table.Column>}
            </Table.Header>
            <Table.Body
              items={data}
              renderEmptyState={() => <div className="p-4">No data</div>}
            >
              {(row) => (
                <Table.Row id={row.activity_id}>
                  {(colId) => {
                    const colKey = String(colId);
                    switch (colKey) {
                      case "apply_link":
                        return (
                          <Table.Cell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() =>
                                window.open(
                                  `/f/aa/user/activity?activity_id=${row.activity_id}`,
                                  "_blank"
                                )
                              }
                            >
                              address
                            </Button>
                          </Table.Cell>
                        );
                      case "apply_detail":
                        return (
                          <Table.Cell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() =>
                                window.open(
                                  `/f/aa/admin/activity-detail?activity_id=${row.activity_id}`,
                                  "_blank"
                                )
                              }
                            >
                              detail
                            </Button>
                          </Table.Cell>
                        );
                      case "actions":
                        return (
                          <Table.Cell>
                            <Button
                              size="sm"
                              variant="primary"
                              className="mr-2"
                              onPress={() => openModal(true, row.activity_id)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onPress={() => setDeleteTarget(row)}
                            >
                              Delete
                            </Button>
                          </Table.Cell>
                        );
                      default:
                        return (
                          <Table.Cell>
                            {String(
                              row[colKey as keyof AdminActivityListRes] ?? ""
                            )}
                          </Table.Cell>
                        );
                    }
                  }}
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      <div className="flex justify-end p-4 bg-white">
        <Pagination aria-label="pagination">
          <Pagination.Summary>
            {page} / {totalPages}
          </Pagination.Summary>
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous
                onPress={() => handlePageChange(page - 1)}
                isDisabled={page <= 1 || loading}
              >
                <Pagination.PreviousIcon />
              </Pagination.Previous>
            </Pagination.Item>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <Pagination.Item key={n}>
                <Pagination.Link
                  isActive={n === page}
                  onPress={() => handlePageChange(n)}
                >
                  {n}
                </Pagination.Link>
              </Pagination.Item>
            ))}
            <Pagination.Item>
              <Pagination.Next
                onPress={() => handlePageChange(page + 1)}
                isDisabled={page >= totalPages || loading}
              >
                <Pagination.NextIcon />
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      </div>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen}>
        <Modal.Backdrop>
          <Modal.Container size="md" placement="center">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>
                  {modalState.isEdit ? "Edit" : "添加"}活动信息
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                {modalOpen && (
                  <ActivityForm
                    key={modalState.isEdit ? modalState.activityId : "add"}
                    ref={activityFormRef}
                    initialValue={modalState.initialValue}
                  />
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="ghost" onPress={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onPress={handleSubmit}>
                  Submit
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <AlertDialog
        isOpen={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container placement="center">
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Icon status="warning" />
                <AlertDialog.Heading>Confirm Delete</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                Are you sure you want to delete this activity?
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <AlertDialog.CloseTrigger>
                  <Button variant="ghost">Cancel</Button>
                </AlertDialog.CloseTrigger>
                <AlertDialog.CloseTrigger>
                  <Button variant="danger" onPress={handleDelete}>
                    Delete
                  </Button>
                </AlertDialog.CloseTrigger>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
