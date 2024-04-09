import io from "socket.io-client";

export const socket = io(
  process.env.REACT_APP_SERVER_HOST || "https://stellar.owlting.worker:9999",
  { path: "/api" },
);
