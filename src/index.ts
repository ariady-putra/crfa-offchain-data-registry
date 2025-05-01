require("dotenv").config();

import { env } from "process";
import express, { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import * as api from "./handler";

const app = express();
app.use(express.json());

const port = env.HOSTED
  ? parseInt(`${env.PORT}`)
  : 35183;
const server = app.listen(port,
  () => console.log(env.HOSTED ? server.address() : `http://localhost:${port}`),
);

const notFound = (req: Request, rsp: Response) => {
  rsp.status(404);
  rsp.json({ error: `Cannot ${req.method} ${req.path}` });
};

const dailyLimit = rateLimit({
  limit: 50_000,
  windowMs: 86_400_000,
  keyGenerator: () => "globalDailyLimit",
  handler: (_, rsp) => rsp.status(429).json({ error: "Daily limit reached!" }),
});
const burstLimit = rateLimit({
  limit: 10,
  windowMs: 1_000,
  keyGenerator: () => "globalBurstLimit",
  handler: (_, rsp) => rsp.status(429).json({ error: "Burst limit reached!" }),
});

//////////////////////////////////////////////////////////////// API Endpoints ////////////////////////////////////////////////////////////////

app.get("/addresses/:address/txs/:hash", burstLimit, dailyLimit, api.describeAddressTransaction);

app.get("/stats", api.getDescriberStats);

app.all("*", notFound);
