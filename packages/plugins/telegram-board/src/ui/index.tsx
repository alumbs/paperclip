import { usePluginData, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";

type HealthData = {
  status: "ok" | "degraded" | "error";
  checkedAt: string;
  configured: boolean;
};

export function DashboardWidget(_props: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<HealthData>("health");

  if (loading) return <div>Loading plugin health...</div>;
  if (error) return <div>Plugin error: {error.message}</div>;

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <strong>Telegram Board</strong>
      <div>Health: {data?.status ?? "unknown"}</div>
      <div>Configured: {data?.configured ? "yes" : "no"}</div>
      <div>Checked: {data?.checkedAt ?? "never"}</div>
    </div>
  );
}
