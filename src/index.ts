
import express, { Request } from "express";
import { CookieOptions } from "express";

export enum Method {
  get = "get",
  post = "post",
  patch = "patch",
  put = "put",
  delete = "delete",
};

export type RouterResolve = (request: RouterRequest, response?: RouterResponse) => Promise<any> | any;

export interface Log {
  error: (...params: string[]) => void;
}

export interface Route {
  method: Method;
  path: string;
  resolves?: RouterResolve[];
  action?: string;
  callback?: (...params: any[]) => Promise<Result<any>>;
}

export interface ErrorResult {
  status?: number;
  name?: string;
  message?: string;
  details?: object;
}

export interface Router {
  debug: boolean,
  controller?: object;
  onError?: (error: Error, request: Request) => ErrorResult;
  log: Log;
  routes: Route[];
}

export interface Cookie {
  value: string;
  options: CookieOptions;
}

export interface Result<T> {
  json?: T;
  binary?: Buffer;
  cookies?: {[key: string]: Cookie};
  headers?: {[key: string]: string};
  redirect?: string;
  status?: number;
  count?: number;
  debug?: boolean;
  content?: string;
  text?: string;
  stream?: NodeJS.ReadableStream;
}

export interface RouterRequest extends express.Request {}

export interface RouterResponse extends express.Response {}

function handler(
  router: express.Router,
  method: string,
  path: string,
  listener: (request: RouterRequest, response: RouterResponse) => void,
) {
  switch (method) {
    case Method.get: {
      return router.get(path, listener);
    }
    case Method.post: {
      return router.post(path, listener);
    }
    case Method.patch: {
      return router.patch(path, listener);
    }
    case Method.put: {
      return router.put(path, listener);
    }
    case Method.delete: {
      return router.delete(path, listener);
    }
  }
}

export function createRouter(params: Router) {
  const router: express.Router = express.Router();
  const controller: {[key: string]: any} = params.controller;

  params.routes.forEach((route: Route) => {
    handler(router, route.method, route.path, (request: RouterRequest, response: RouterResponse) => {
      const time = Date.now();
      const promises: Array<Promise<any>> = [
        Promise.resolve(request),
      ];
      if (route.resolves) {
        route.resolves.forEach((resolve: RouterResolve) => {
          promises.push(resolve(request, response));
        });
      }
      Promise.all(promises).then((results: any[]) => {
        if (route.action) {
          return controller[route.action].apply(controller, results);
        }
        return route.callback(...results);
      }).then((result: Result<any>) => {
        if (typeof result.cookies === "object") {
          Object.keys(result.cookies).forEach((key) => {
            const cookie: Cookie = result.cookies[key];
            response.cookie(key, cookie.value, cookie.options);
          });
        }

        if (typeof result.headers === "object") {
          Object.keys(result.headers).forEach((key) => {
            const header = result.headers[key];
            response.header(key, header);
          });
        }

        if (typeof result.redirect === "string") {
          response.redirect(result.redirect);
          return;
        }

        if (typeof result.status === "number") {
          response.status(result.status);
        } else {
          response.status(200);
        }

        if (typeof result.count === "number") {
          response.header("X-Total-Count", result.count.toString());
        }

        if (params.debug) {
          response.header("X-Request-Duration", (Date.now() - time).toString());
        }

        if (result.binary) {
          response.end(result.binary);
        } else if (typeof result.json === "object") {
          const json: any = result.json;
          if (result.json) {
            if (params.debug && result.debug) {
              json["debug"] = result.debug;
            }
          }
          response.json(json);
        } else if (typeof result.text === "string") {
          response.end(result.text);
        } else if (typeof result.content === "string") {
          const content = result.content;
          if (!result.headers || !result.headers["Content-Type"] && !result.headers["content-type"]) {
            response.contentType("text/html; charset=UTF-8");
          }
          response.end(content);
        } else if (typeof result.stream === "object") {
          result.stream.pipe(response);

          result.stream.on("end", () => {
            response.end();
          });
        } else {
          response.status(400);
          response.json({
            error: {
              name: "badRequest",
              message: "Bad Request",
            },
          });
        }
      }).catch((error) => {
        if (error && typeof params.onError === "function") {
          const errorData = params.onError(error, request);
          if (errorData.status) {
            response.status(errorData.status);
          }
          response.json({
            error: {
              name: errorData.name,
              message: errorData.message,
              details: errorData.details,
            },
          });
          return;
        }

        params.log.error("[path-router-express]", error);
        response.status(500);
        response.json({
          error: {
            name: "internalError",
            message: error.message || "Internal Error",
          },
        });
      });
    });
  });
  return router;
}
