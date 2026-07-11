import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import DeviceHubOutlinedIcon from "@mui/icons-material/DeviceHubOutlined";
import MergeTypeOutlinedIcon from "@mui/icons-material/MergeTypeOutlined";
import { Admin, Resource } from "react-admin";
import { authProvider } from "./authProvider";
import { dataProvider } from "./dataProvider";
import { AdminLayout } from "./layout/AdminLayout";
import { LoginPage } from "./LoginPage";
import { ContributionsList } from "./resources/contributions";
import { IssuesList } from "./resources/issues";
import { RepositoriesList } from "./resources/repositories";
import { RunnersList } from "./resources/runners";
import { adminTheme } from "./theme";
export default function App() {
  return (
    <Admin
      title="Prompt for Good Admin"
      dataProvider={dataProvider}
      authProvider={authProvider}
      theme={adminTheme}
      darkTheme={null}
      loginPage={LoginPage}
      layout={AdminLayout}
      requireAuth
    >
      <Resource
        name="repositories"
        list={RepositoriesList}
        icon={CodeOutlinedIcon}
      />
      <Resource name="issues" list={IssuesList} icon={AssignmentOutlinedIcon} />
      <Resource name="runners" list={RunnersList} icon={DeviceHubOutlinedIcon} />
      <Resource
        name="contributions"
        list={ContributionsList}
        icon={MergeTypeOutlinedIcon}
      />
    </Admin>
  );
}
