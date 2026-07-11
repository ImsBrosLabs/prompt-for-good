import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import DeviceHubOutlinedIcon from "@mui/icons-material/DeviceHubOutlined";
import MergeTypeOutlinedIcon from "@mui/icons-material/MergeTypeOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { Admin, CustomRoutes, Resource } from "react-admin";
import { Route } from "react-router-dom";
import { authProvider } from "./authProvider";
import { dataProvider } from "./dataProvider";
import { AdminLayout } from "./layout/AdminLayout";
import { LoginPage } from "./LoginPage";
import { OperationsPage } from "./operations/OperationsPage";
import { ContributionsList } from "./resources/contributions";
import { ConfigurationList } from "./resources/configuration";
import { IssuesList } from "./resources/issues";
import { RepositoriesList } from "./resources/repositories";
import { RunnersList } from "./resources/runners";
import { ScoringPage } from "./scoring/ScoringPage";
import { adminDarkTheme, adminLightTheme } from "./theme";
export default function App() {
  return (
    <Admin
      title="Prompt for Good Admin"
      dataProvider={dataProvider}
      authProvider={authProvider}
      theme={adminLightTheme}
      darkTheme={adminDarkTheme}
      loginPage={LoginPage}
      layout={AdminLayout}
      requireAuth
    >
      <CustomRoutes>
        <Route path="/operations" element={<OperationsPage />} />
        <Route path="/scoring" element={<ScoringPage />} />
      </CustomRoutes>
      <Resource
        name="repositories"
        list={RepositoriesList}
        icon={CodeOutlinedIcon}
        options={{ label: "Repositories" }}
      />
      <Resource
        name="issues"
        list={IssuesList}
        icon={AssignmentOutlinedIcon}
        options={{ label: "Issues" }}
      />
      <Resource
        name="runners"
        list={RunnersList}
        icon={DeviceHubOutlinedIcon}
        options={{ label: "Runners" }}
      />
      <Resource
        name="contributions"
        list={ContributionsList}
        icon={MergeTypeOutlinedIcon}
        options={{ label: "Contributions" }}
      />
      <Resource
        name="configuration"
        list={ConfigurationList}
        icon={SettingsOutlinedIcon}
        options={{ label: "Configuration" }}
      />
    </Admin>
  );
}
