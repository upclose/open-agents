export default function VideoPage() {
  return (
    <main style={{ padding: "1rem" }}>
      <h1>Recorded Video</h1>
      <video
        controls
        style={{ width: "100%", maxWidth: "960px", height: "auto" }}
      >
        <source src="/ai-sdk-provider-demo.webm" type="video/webm" />
        <track kind="captions" src="data:text/vtt,WEBVTT" />
        Your browser does not support the video tag.
      </video>
    </main>
  );
}
