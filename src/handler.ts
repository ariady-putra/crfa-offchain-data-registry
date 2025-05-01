import { Request, Response } from "express";
import * as svc from "./svc/_";

export async function getDescriberStats(req: Request, rsp: Response) {
  try {
    const stats = await svc.describer
      .getStats();
    rsp.json(stats);
  } catch (error) {
    _respondError(rsp, error);
  }
}

export async function describeAddressTransaction(req: Request, rsp: Response) {
  try {
    const { ip } = req;
    if (!ip) throw {
      status_code: 403,
      message: "Unidentifiable Requester",
    };

    const reqTime = new Date().getTime();

    const description = await svc.describer
      .describeAddressTransaction(
        req.params.address,
        req.params.hash,
      );
    rsp.json(description);

    const rspTime = new Date().getTime();

    _log(ip,                                                // client identifier:
      { path: req.path, time: reqTime },                    // request path and time,
      { body: JSON.stringify(description), time: rspTime }, // response body and time,
      { uuid: description.id, time: rspTime - reqTime },    // process uuid and duration
    );
  } catch (error) {
    _respondError(rsp, error);
  }
};

function _log(client: string,
  request: { path: string, time: number; },
  response: { body: string, time: number; },
  process: { uuid: string, time: number; }) {
  console.log({ client, request, response, process });
}

function _respondError(resp: Response, error: any, status: number = 500) {
  resp
    .status(error.status_code ?? status)
    .json({ error: error.message ?? error });
};
