import {
  Datagrid,
  DateField,
  List,
  NumberField,
  SelectInput,
  TextField,
  TextInput,
  UrlField,
} from "react-admin";

const issueFilters = [
  <TextInput key="search" source="q" label="Search" alwaysOn />,
  <SelectInput
    key="status"
    source="status"
    choices={["PENDING", "CLAIMED", "DONE", "FAILED"].map((status) => ({
      id: status,
      name: status,
    }))}
  />,
  <SelectInput
    key="difficulty"
    source="difficulty"
    choices={["easy", "medium", "hard"].map((difficulty) => ({
      id: difficulty,
      name: difficulty,
    }))}
  />,
];

export function IssuesList() {
  return (
    <List
      title="Issues"
      filters={issueFilters}
      perPage={25}
      sort={{ field: "score", order: "DESC" }}
    >
      <Datagrid bulkActionButtons={false} rowClick={false}>
        <TextField source="title" />
        <TextField source="status" />
        <TextField source="difficulty" />
        <NumberField source="score" />
        <NumberField source="estimatedMinutes" label="Estimate (min)" />
        <NumberField source="retryCount" />
        <UrlField source="githubUrl" label="GitHub" />
        <DateField source="updatedAt" showTime />
      </Datagrid>
    </List>
  );
}
