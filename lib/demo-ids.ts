// The curated public demo lineup, in display order. Shared by the public
// /demo gallery and the owner's "Demo" tab on the index, so what the owner
// reviews while signed in is exactly what a stranger sees.
//
// An id that no longer exists is skipped by both, silently - check the Demo
// tab's count against this list before a public release.
export const DEMO_IDS = [
  "c59940a0-0f79-4d50-a95e-65a11585a285", // Claude Code Agent Loop
  "6a2ab8a2-66f6-49ed-a79a-7dc6517c0234", // Deep Research Harness
  "70ccb869-b242-4241-99ff-f3d1dd794f38", // Kubernetes Pod Scheduling
  "2a63fec3-c3be-46ba-9f46-a2c664d50fb2", // gRPC Bidirectional Streaming
  "bdb6782c-ccd2-4b36-ac90-c7c6acb4e668", // LLM RAG Pipeline
  "da945272-2901-4cfd-8332-f296becbf298", // Event-Driven Checkout
  "1bb559c1-73a7-4eab-a292-93f57402dde0", // OAuth 2.0 PKCE Flow
] as const;
