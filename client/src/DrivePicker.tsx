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

export default function DrivePicker({ onSelected }: Props) {
  const openPicker = () => {
    if (!CLIENT_ID || !API_KEY || !APP_ID) {
      alert("Set the Google values in client/.env first.");
      return;
    }

    if (!window.google?.accounts?.oauth2 || !window.gapi) {
      alert("Google APIs are still loading. Try again.");
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (tokenResponse: any) => {
        const accessToken = tokenResponse.access_token;

        window.gapi.load("picker", () => {
          const view = new window.google.picker.DocsView(
            window.google.picker.ViewId.DOCS
          );

          // Show video files. This is a convenience filter, not a security check.
          view.setMimeTypes(
            "video/mp4,video/webm,video/quicktime,video/x-matroska"
          );

          const picker = new window.google.picker.PickerBuilder()
            .setAppId(APP_ID)
            .setOAuthToken(accessToken)
            .setDeveloperKey(API_KEY)
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
