import { Request, Response, NextFunction } from "express";

export const developmentOnly = (
  _: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (process.env.NODE_ENV !== "development") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
};
