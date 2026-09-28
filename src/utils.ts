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

import { createHash } from 'crypto';

const longKey = 128;

/**
 * Extract parameter names from function signature
 * @param func The function to extract parameters from
 * @returns Array of parameter names
 */
export function getArgs(func: (...args: any[]) => any): string[] {
  try {
    const funcStr = func.toString()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/\s+/g, ' ');

    const argsMatch = funcStr.match(/(?:async\s+)?(?:function\s*)?(?:\w+\s*)?\(([^)]*)\)/)
      || funcStr.match(/(?:async\s+)?\(([^)]*)\)/)
      || funcStr.match(/^(?:async\s+)?([^(]+)=>/);

    if (!argsMatch) {
      return [];
    }

    const argsString = argsMatch[1] || argsMatch[0] || '';
    if (!argsString.trim()) {
      return [];
    }

    return argsString.split(',')
      .map(function (a) {
        const trimmed = a.trim();
        const nameMatch = trimmed.match(/^(\w+)/);
        return nameMatch ? nameMatch[1] : '';
      })
      .filter(function (name) {
        return name && name !== '_';
      });
  } catch (error) {
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
  const hasUnresolved = paramIndexes.some(idx => idx < 0);
  if (hasUnresolved) {
    key += `:${JSON.stringify(props)}`;
  } else {
    for (let i = 0; i < paramIndexes.length; i++) {
      const paramIndex = paramIndexes[i];
      if (paramIndex >= 0 && props[paramIndex] !== undefined) {
        key += `:${paramNames[i]}:${Helper.toString(props[paramIndex])}`;
      }
    }
  }
  return key.length > longKey ? `${cacheName.slice(0, 80)}:sha1:${createHash('sha1').update(key).digest('hex')}` : key;
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