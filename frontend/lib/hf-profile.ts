export interface HFProfile {
  hfToken: string;
  hfUsername: string;
}

export function getHFProfile(): HFProfile {
  if (typeof window === "undefined") return { hfToken: "", hfUsername: "" };
  return {
    hfToken: localStorage.getItem("hf_token") ?? "",
    hfUsername: localStorage.getItem("hf_username") ?? "",
  };
}

export function saveHFProfile(token: string, username: string): void {
  localStorage.setItem("hf_token", token);
  localStorage.setItem("hf_username", username);
}
