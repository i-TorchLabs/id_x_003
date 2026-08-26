"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, Pagination, Spinner, Table, toast } from "@heroui/react";
import {
  adminActivityDetailApi,
  type AdminActivityDetail,
} from "@/api/admin";

const columns = [
  { id: "form_number", name: "Form No." },
  { id: "student_id", name: "Number" },
  { id: "email", name: "Email" },
  { id: "apply_time", name: "Applied Time" },
  { id: "state", name: "State" },
  { id: "info_1", name: "Info" },
  // { id: "info_2", name: "Msg.2" },
  // { id: "info_3", name: "Msg.3" },
  // { id: "info_4", name: "Msg.4" },
  // { id: "info_5", name: "Msg.5" },
  // { id: "info_6", name: "Msg.6" },
  // { id: "info_7", name: "Msg.7" },
  // { id: "info_8", name: "Msg.8" },
];

const PAGE_SIZE = 20;

export default function ActivityManagementDetailView() {
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AdminActivityDetail[]>([]);
  const [page, setPage] = useState(1);
  const [itemCount, setItemCount] = useState(0);
  const [descriptions, setDescriptions] = useState({
    Occupied: "--",
    Offered: "--",
    Start_Time: "--",
    End_Time: "--",
  });

  const getData = useCallback(async () => {
    setLoading(true);
    let result: AdminActivityDetail[] = [];
    try {
      const res = await adminActivityDetailApi({
        activity_id: Number(searchParams.get("activity_id")) || undefined,
      });
      result = res.detail;
      setItemCount(Number(res.total));
      setDescriptions({
        End_Time: res.end_time,
        Occupied: res.number,
        Offered: res.quota,
        Start_Time: res.start_time,
      });
    } catch (error) {
      toast.danger("Fail to load data.");
    }
    setData(result || []);
    setLoading(false);
  }, [searchParams]);

  useEffect(() => {
    getData();
  }, [getData]);

  const handlePageChange = (p: number) => {
    if (loading) return;
    setPage(p);
    getData();
  };

  const totalPages = Math.max(1, Math.ceil(itemCount / PAGE_SIZE));

  return (
    <>
      <Card className="mb-2">
        <Card.Content>
          <dl className="grid grid-cols-4 border border-separate">
            {Object.entries(descriptions).map(([key, desc]) => (
              <div key={key} className="flex border p-2">
                <dt className="font-medium mr-2 whitespace-nowrap">{key}</dt>
                <dd>{desc}</dd>
              </div>
            ))}
          </dl>
        </Card.Content>
      </Card>
      <Table aria-label="activity detail">
        <Table.ScrollContainer>
          <Table.Content aria-label="data table">
            <Table.Header columns={columns}>
              {(col) => <Table.Column id={col.id} isRowHeader={col.id === columns[0].id}>{col.name}</Table.Column>}
            </Table.Header>
            <Table.Body
              items={data.map((row, i) => ({ ...row, __rowId: i }))}
              renderEmptyState={() =>
                loading ? (
                  <Spinner size="md" color="accent" aria-label="loading" />
                ) : (
                  <div />
                )
              }
            >
              {(row) => (
                <Table.Row id={row.__rowId} columns={columns}>
                  {(column: { id: string; name: string }) => (
                    <Table.Cell>
                      {String(
                        row[column.id as keyof AdminActivityDetail] ?? ""
                      )}
                    </Table.Cell>
                  )}
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      <div className="flex justify-end mt-2">
        <Pagination aria-label="pagination">
          <Pagination.Summary>
            {page} / {totalPages} (Total: {itemCount})
          </Pagination.Summary>
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous
                isDisabled={page <= 1}
                onPress={() => handlePageChange(page - 1)}
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
                isDisabled={page >= totalPages}
                onPress={() => handlePageChange(page + 1)}
              >
                <Pagination.NextIcon />
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      </div>
    </>
  );
}
