import { Chip } from "@mui/material";
import {
  BooleanField,
  Datagrid,
  DateField,
  FunctionField,
  List,
  NumberField,
  SelectInput,
  TextField,
  TextInput,
} from "react-admin";

type RunnerRecord = {
  id: string;
  active?: boolean;
  quotaRemainingToday?: number | null;
};

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
        <FunctionField<RunnerRecord>
          label="Dispatch"
          sortable={false}
          render={(runner) => <DispatchStatus runner={runner} />}
        />
        <DateField source="lastSeenAt" showTime />
        <DateField source="createdAt" showTime />
      </Datagrid>
    </List>
  );
}

/** Mirrors the hub's runner-level dispatch gate without implying claim ownership. */
function DispatchStatus({ runner }: { runner?: RunnerRecord }) {
  if (!runner?.active) {
    return <Chip size="small" label="Inactive" variant="outlined" />;
  }
  if ((runner.quotaRemainingToday ?? 0) <= 0) {
    return <Chip size="small" color="warning" label="Quota exhausted" />;
  }
  return <Chip size="small" color="success" label="Eligible" />;
}
