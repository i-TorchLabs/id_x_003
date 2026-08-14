"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  Button,
  Form,
  Input,
  Label,
  Modal,
  Pagination,
  Table,
  TextField,
  toast,
} from "@heroui/react";
import {
  adminProjectCreateApi,
  adminProjectDeleteApi,
  adminProjectListApi,
  adminProjectSearchApi,
  adminProjectUpdateApi,
  type AdminProjectListRes,
  type AdminProjectUpdateReq,
  type AdminProjectCreateReq,
} from "@/api/admin";
import { useUserStore } from "@/context/UserContext";
import { sanitizeHtml } from "@/utils/sanitize";
import ProjectForm, {
  type ProjectFormRef,
  type ProjectFormValue,
} from "@/components/aa/ProjectForm";

/** datetime-local 值 (yyyy-MM-ddTHH:mm) -> 接口格式 (yyyy-MM-dd HH:mm) */
const dateTimeToStr = (value: string): string | undefined =>
  value ? value.replace("T", " ") : undefined;

/** 与 Report 页面一致的时间选择器(TextField + datetime-local) */
function SearchDatePicker({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField value={value} onChange={onChange} aria-label={label}>
      <div className="flex items-center gap-2">
        <Label className="shrink-0">{label}</Label>
        <Input type="datetime-local" placeholder={placeholder} aria-label={placeholder} />
      </div>
    </TextField>
  );
}

interface ModalState {
  isEdit: boolean;
  projectId: string;
  initialValue?: Partial<ProjectFormValue>;
  initialContent?: string;
}

export default function ProjectManagementView() {
  const userStore = useUserStore();

  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [itemCount, setItemCount] = useState(0);
  const pageSize = 20;
  const [data, setData] = useState<AdminProjectListRes[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalState, setModalState] = useState<ModalState>({
    isEdit: false,
    projectId: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<AdminProjectListRes | null>(
    null
  );
  const projectFormRef = useRef<ProjectFormRef>(null);

  const getData = useCallback(
    async (pageNo = page) => {
      setLoading(true);
      let result: AdminProjectListRes[] = [];
      try {
        const res = await adminProjectListApi({
          user_id: userStore.state.userId,
          offset: pageNo.toString(),
          limit: pageSize.toString(),
          start_date: dateTimeToStr(startDate),
          end_date: dateTimeToStr(endDate),
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

  const openModal = async (isEdit = false, projectId = "") => {
    if (isEdit) {
      const projectFormData = await adminProjectSearchApi({
        project_id: projectId,
      });
      setModalState({
        isEdit,
        projectId,
        initialValue: {
          project_name: projectFormData.product_name,
          quota: projectFormData.quota,
          owner: (projectFormData as unknown as { owner?: string }).owner ?? null,
        },
        initialContent: projectFormData.proudct_content,
      });
    } else {
      setModalState({ isEdit, projectId, initialValue: undefined });
    }
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const reqData = {
      project_content: projectFormRef.current?.richTextEditor?.getHtmlContent?.(),
      ...projectFormRef.current?.formValue,
    } as AdminProjectCreateReq & { project_id?: string };
    if (modalState.isEdit) {
      reqData.project_id = modalState.projectId;
      await adminProjectUpdateApi(reqData as AdminProjectUpdateReq);
    } else {
      await adminProjectCreateApi(reqData);
    }
    setModalOpen(false);
    getData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await adminProjectDeleteApi({
      project_id: deleteTarget.project_id,
    });
    getData();
  };

  const totalPages = Math.max(1, Math.ceil(itemCount / pageSize));

  const columns = [
    { id: "project_name", name: "Title" },
    { id: "project_content", name: "Contents" },
    { id: "quota", name: "Offered" },
    { id: "update_time", name: "Update" },
    { id: "actions", name: "Options" },
  ];

  return (
    <div>
      <div className="bg-[#fff] p-5 mb-2 flex items-center justify-between">
        <Form
          className="flex flex-row items-center gap-4"
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
        </Form>
        <Button variant="primary" onPress={() => openModal(false)}>
          Add
        </Button>
      </div>

      <Table aria-label="Project list">
        <Table.ScrollContainer>
          <Table.Content aria-label="data table">
            <Table.Header columns={columns}>
              {(col) => <Table.Column id={col.id} isRowHeader={col.id === columns[0].id}>{col.name}</Table.Column>}
            </Table.Header>
            <Table.Body
              items={data}
              renderEmptyState={() => <div className="p-4">No data</div>}
            >
              {(row) => (
                <Table.Row id={row.project_id} columns={columns}>
                  {(column: { id: string; name: string }) => {
                    const colKey = column.id;
                    switch (colKey) {
                      case "project_content":
                        return (
                          <Table.Cell>
                            <div
                              className="max-w-[400px] truncate"
                              dangerouslySetInnerHTML={{
                                __html: sanitizeHtml(row.project_content),
                              }}
                            />
                          </Table.Cell>
                        );
                      case "actions":
                        return (
                          <Table.Cell>
                            <Button
                              size="sm"
                              variant="primary"
                              className="mr-2"
                              onPress={() => openModal(true, row.project_id)}
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
                            {String(row[colKey as keyof AdminProjectListRes] ?? "")}
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
          <Modal.Container size="lg" placement="center">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>
                  {modalState.isEdit ? "Edit" : "Add"} Subject
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                {modalOpen && (
                  <ProjectForm
                    key={modalState.isEdit ? modalState.projectId : "add"}
                    ref={(instance) => {
                      projectFormRef.current = instance;
                      if (
                        instance &&
                        modalState.isEdit &&
                        modalState.initialContent != null
                      ) {
                        instance.richTextEditor?.setContents(
                          modalState.initialContent
                        );
                      }
                    }}
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
                Are you sure you want to delete this project?
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="ghost" onPress={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onPress={() => {
                    setDeleteTarget(null);
                    handleDelete();
                  }}
                >
                  Delete
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
