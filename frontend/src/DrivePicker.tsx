type Props = {
  onSelected: (file: {
    id: string;
    name: string;
    accessToken: string;
  }) => void;
};

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID;

function getTopOrigin() {
  try {
    if (window.top) {
      return window.top.location.protocol + "//" + window.top.location.host;
    }
  } catch {
    // Fall back to this page.
  }

  return window.location.protocol + "//" + window.location.host;
}

export default function DrivePicker({ onSelected }: Props) {
  const openPicker = () => {
    if (!CLIENT_ID || !API_KEY || !APP_ID) {
      alert("Missing Google values in frontend/.env");
      return;
    }

    if (!window.google?.accounts?.oauth2 || !window.gapi) {
      alert("Google APIs are still loading. Try again.");
      return;
    }

    const pickerOrigin = getTopOrigin();

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file",

      callback: (tokenResponse: any) => {
        if (tokenResponse.error || !tokenResponse.access_token) {
          console.error(
            "Google OAuth token error:",
            tokenResponse.error || "No access token returned"
          );
          alert("Google Drive authorization failed. Please try again.");
          return;
        }

        const accessToken = tokenResponse.access_token;

        window.gapi.load("picker", () => {
          const view = new window.google.picker.DocsView(
            window.google.picker.ViewId.DOCS
          );

          view.setMimeTypes(
            "video/mp4,video/webm,video/quicktime,video/x-matroska"
          );

          const picker = new window.google.picker.PickerBuilder()
            .setAppId(APP_ID)
            .setOAuthToken(accessToken)
            .setDeveloperKey(API_KEY)
            .setOrigin(pickerOrigin)
            .addView(view)
            .setCallback((data: any) => {
              if (
                data.action === window.google.picker.Action.PICKED &&
                data.docs?.[0]
              ) {
                const doc = data.docs[0];

                onSelected({
                  id: doc.id,
                  name: doc.name,
                  accessToken
                });
              }
            })
            .build();

          picker.setVisible(true);
        });
      },

      error_callback: (error: any) => {
        console.error("Google OAuth popup error:", error);
      }
    });

    tokenClient.requestAccessToken({ prompt: "" });
  };

  return (
    <button className="primary" onClick={openPicker}>
      Choose Google Drive Video
    </button>
  );
}
