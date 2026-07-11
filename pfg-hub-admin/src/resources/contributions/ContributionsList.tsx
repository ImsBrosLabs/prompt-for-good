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

const contributionFilters = [
  <TextInput key="search" source="q" label="Search" alwaysOn />,
  <SelectInput
    key="status"
    source="status"
    choices={["SUCCESS", "FAILED"].map((status) => ({
      id: status,
      name: status,
    }))}
  />,
];

export function ContributionsList() {
  return (
    <List
      title="Contributions"
      filters={contributionFilters}
      perPage={25}
      sort={{ field: "createdAt", order: "DESC" }}
    >
      <Datagrid bulkActionButtons={false} rowClick={false}>
        <TextField source="status" />
        <TextField source="issueId" />
        <TextField source="runnerId" />
        <UrlField source="prUrl" label="Pull request" />
        <NumberField source="tokensUsed" />
        <DateField source="createdAt" showTime />
      </Datagrid>
    </List>
  );
}
