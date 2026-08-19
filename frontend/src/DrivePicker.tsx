type Props = {
  disabled: boolean;
  getAccessToken: () => Promise<string | null>;
  onSelected: (file: {
    id: string;
    name: string;
    accessToken: string;
  }) => void;
};

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID;

export default function DrivePicker({
  disabled,
  getAccessToken,
  onSelected
}: Props) {
  const openPicker = async () => {
    if (disabled) return;

    if (!API_KEY || !APP_ID) {
      alert("Missing Google values in frontend/.env");
      return;
    }

    const accessToken = await getAccessToken();

    if (!accessToken) {
      return;
    }

    if (!window.gapi) {
      return;
    }

    const pickerOrigin =
      window.location.protocol + "//" + window.location.host;

    window.gapi.load("picker", () => {
      const view = new window.google.picker.DocsView(
        window.google.picker.ViewId.DOCS
      );

      view.setMimeTypes(
        "video/mp4,video/webm,video/quicktime,video/x-matroska"
      );
      view.setMode(window.google.picker.DocsViewMode.LIST);
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(false);

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
  };

  return (
    <button
      className="primary"
      disabled={disabled}
      onClick={openPicker}
    >
      {disabled ? "Loading Google Drive..." : "Choose Video"}
    </button>
  );
}
