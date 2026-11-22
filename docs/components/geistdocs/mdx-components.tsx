import { createMdxComponents } from "@vercel/geistdocs/mdx";
import type { MDXComponents } from "mdx/types";
import { Diagram } from "@/components/geistdocs/diagram";

export const getMDXComponents = (components?: MDXComponents): MDXComponents =>
  createMdxComponents({ Diagram, ...components });
