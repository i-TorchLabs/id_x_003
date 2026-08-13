"use client";

import { useCallback, useEffect, useState } from "react";
import { Pagination, Spinner, Table } from "@heroui/react";
import {
  queryTitleSearchApi,
  queryDataSearchApi,
  type QueryDataSearchRes,
} from "@/api/admin";

const columns = [
  { id: "seq", name: "Seq" },
  { id: "aictivity_name", name: "Aictivity Name" },
  { id: "order", name: "Order" },
  { id: "name", name: "Name" },
  { id: "number", name: "Number" },
  { id: "email", name: "Email" },
  { id: "time", name: "Time" },
  { id: "info_1", name: "Info" },
  // { id: "info_2", name: "Info.2" },
  // { id: "info_3", name: "Info.3" },
  // { id: "info_4", name: "Info.4" },
  // { id: "info_5", name: "Info.5" },
  // { id: "info_6", name: "Info.6" },
  // { id: "info_7", name: "Info.7" },
  // { id: "info_8", name: "Info.8" },
];

const PAGE_SIZE = 20;

export default function QueryManagementView() {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [itemCount, setItemCount] = useState(0);
  const [data, setData] = useState<QueryDataSearchRes[]>([]);

  const getData = useCallback(
    async (p: number, titles: string[] = title) => {
      setLoading(true);
      const res = await queryDataSearchApi({
        title: titles,
        offset: p.toString(),
        limit: PAGE_SIZE.toString(),
      });
      setLoading(false);
      setData(res.result);
      setItemCount(Number(res.total));
    },
    [title]
  );

  useEffect(() => {
    (async () => {
      const { title_list } = await queryTitleSearchApi();
      setTitle(title_list);
      getData(1, title_list);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 与源码 watch(props.title) 对应:title 变化时重新拉取
  useEffect(() => {
    if (title.length === 0) return;
    getData(page, title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  const handlePageChange = (p: number) => {
    if (loading) return;
    setPage(p);
    getData(p);
  };

  const totalPages = Math.max(1, Math.ceil(itemCount / PAGE_SIZE));

  return (
    <div className="mt-2">
      <Table aria-label="query data">
        <Table.ScrollContainer>
          <Table.Content aria-label="data table">
            <Table.Header columns={columns}>
              {(col) => <Table.Column id={col.id}>{col.name}</Table.Column>}
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
                <Table.Row id={row.__rowId}>
                  {(colId) => (
                    <Table.Cell>
                      {String(
                        row[colId as unknown as keyof QueryDataSearchRes] ?? ""
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
    </div>
  );
}
