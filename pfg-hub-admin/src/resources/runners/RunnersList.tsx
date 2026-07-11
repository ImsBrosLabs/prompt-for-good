import {
  BooleanField,
  Datagrid,
  DateField,
  List,
  NumberField,
  SelectInput,
  TextField,
  TextInput,
} from "react-admin";

const runnerFilters = [
  <TextInput key="search" source="q" label="Search" alwaysOn />,
  <SelectInput
    key="activity"
    source="active"
    label="Activity"
    choices={[
      { id: true, name: "Active" },
      { id: false, name: "Inactive" },
    ]}
  />,
];

export function RunnersList() {
  return (
    <List
      title="Runners"
      filters={runnerFilters}
      perPage={25}
      sort={{ field: "lastSeenAt", order: "DESC" }}
    >
      <Datagrid bulkActionButtons={false} rowClick={false}>
        <TextField source="contributorName" label="Contributor" />
        <BooleanField source="active" />
        <NumberField source="quotaRemainingToday" label="Quota remaining" />
        <DateField source="lastSeenAt" showTime />
        <DateField source="createdAt" showTime />
      </Datagrid>
    </List>
  );
}
