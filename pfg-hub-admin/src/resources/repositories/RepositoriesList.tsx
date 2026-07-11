import {
  BooleanField,
  Datagrid,
  DateField,
  List,
  NumberField,
  SelectInput,
  TextField,
  TextInput,
  UrlField,
} from "react-admin";

const repositoryFilters = [
  <TextInput key="search" source="q" label="Search" alwaysOn />,
  <SelectInput
    key="eligibility"
    source="eligible"
    label="Eligibility"
    choices={[
      { id: true, name: "Eligible" },
      { id: false, name: "Not eligible" },
    ]}
  />,
];

export function RepositoriesList() {
  return (
    <List
      filters={repositoryFilters}
      perPage={25}
      sort={{ field: "score", order: "DESC" }}
    >
      <Datagrid bulkActionButtons={false} rowClick={false}>
        <TextField source="owner" />
        <TextField source="name" />
        <TextField source="language" />
        <NumberField source="stars" />
        <NumberField source="score" />
        <BooleanField source="eligible" />
        <UrlField source="githubUrl" label="GitHub" />
        <DateField source="lastCrawledAt" showTime />
      </Datagrid>
    </List>
  );
}
