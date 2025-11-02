/* eslint-disable @typescript-eslint/no-unused-vars */
/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2024-11-07 13:54:24
 * @LastEditTime: 2024-11-07 15:25:36
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { Helper } from "koatty_lib";

const longKey = 128;

/**
 * Extract parameter names from function signature
 * @param func The function to extract parameters from
 * @returns Array of parameter names
 */
export function getArgs(func: (...args: any[]) => any): string[] {
  try {
    // Match function parameters in parentheses
    const args = func.toString().match(/.*?\(([^)]*)\)/);
    if (args && args.length > 1) {
      // Split parameters into array and clean them
      return args[1].split(",").map(function (a) {
        // Remove multi-line comments /* ... */ and single-line comments //
        const param = a.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").trim();
        // Extract parameter name (before : or = or end of string)
        const match = param.match(/^(\w+)/);
        return match ? match[1] : "";
      }).filter(function (ae) {
        // Filter out empty strings
        return ae;
      });
    }
    return [];
  } catch (error) {
    // Return empty array if parsing fails
    return [];
  }
}

/**
 * Get parameter indexes based on parameter names
 * @param funcParams Function parameter names
 * @param params Target parameter names to find indexes for
 * @returns Array of parameter indexes (-1 if not found)
 */
export function getParamIndex(funcParams: string[], params: string[]): number[] {
  return params.map(param => funcParams.indexOf(param));
}

/**
 * Generate cache key based on cache name and parameters
 * @param cacheName base cache name
 * @param paramIndexes parameter indexes
 * @param paramNames parameter names
 * @param props method arguments
 * @returns generated cache key
 */
export function generateCacheKey(cacheName: string, paramIndexes: number[], paramNames: string[], props: any[]): string {
  let key = cacheName;
  for (let i = 0; i < paramIndexes.length; i++) {
    const paramIndex = paramIndexes[i];
    if (paramIndex >= 0 && props[paramIndex] !== undefined) {
      key += `:${paramNames[i]}:${Helper.toString(props[paramIndex])}`;
    }
  }
  return key.length > longKey ? Helper.murmurHash(key) : key;
}

/**
 * Create a delay promise
 * @param ms Delay time in milliseconds
 * @returns Promise that resolves after the specified delay
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function after a specified delay
 * @param fn Function to execute
 * @param ms Delay time in milliseconds
 * @returns Promise that resolves with the function result
 */
export async function asyncDelayedExecution(fn: () => any, ms: number): Promise<any> {
  await delay(ms);
  return fn();
}