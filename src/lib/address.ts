import { type KaspaNetwork } from '../types'

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const CHARSET_INVERSE_INDEX: Record<string, number> = {
  q: 0, p: 1, z: 2, r: 3, y: 4, 9: 5, x: 6, 8: 7,
  g: 8, f: 9, '2': 10, t: 11, v: 12, d: 13, w: 14, '0': 15,
  s: 16, '3': 17, j: 18, n: 19, '5': 20, '4': 21, k: 22, h: 23,
  c: 24, e: 25, '6': 26, m: 27, u: 28, a: 29, '7': 30, l: 31,
}

const GENERATOR1 = [0x98, 0x79, 0xf3, 0xae, 0x1e]
const GENERATOR2 = [0xf2bc8e61, 0xb76d99e2, 0x3e5fb3c4, 0x2eabe2a8, 0x4f43e470]
const DEFAULT_ALLOWED_PREFIXES = ['kaspa', 'kaspatest', 'kaspadev', 'kaspasim']

function assertValid(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function hasSingleCase(value: string): boolean {
  return value === value.toLowerCase() || value === value.toUpperCase()
}

function convertBits(data: Uint8Array, from: number, to: number, strictMode: boolean): Uint8Array {
  const length = strictMode
    ? Math.floor((data.length * from) / to)
    : Math.ceil((data.length * from) / to)
  const mask = (1 << to) - 1
  const result = new Uint8Array(length)

  let index = 0
  let accumulator = 0
  let bits = 0

  for (let i = 0; i < data.length; i++) {
    const value = data[i]
    assertValid(0 <= value && (value >> from) === 0, `Invalid value: ${value}.`)
    accumulator = (accumulator << from) | value
    bits += from

    while (bits >= to) {
      bits -= to
      result[index] = (accumulator >> bits) & mask
      index++
    }
  }

  if (!strictMode) {
    if (bits > 0) {
      result[index] = (accumulator << (to - bits)) & mask
      index++
    }
  } else {
    assertValid(
      bits < from && ((accumulator << (to - bits)) & mask) === 0,
      `Input cannot be converted to ${to} bits without padding, but strict mode was used.`
    )
  }

  return result
}

function base32Encode(data: Uint8Array): string {
  let encoded = ''
  for (let i = 0; i < data.length; i++) {
    const value = data[i]
    assertValid(0 <= value && value < 32, `Invalid value: ${value}.`)
    encoded += CHARSET[value]
  }
  return encoded
}

function base32Decode(value: string): Uint8Array {
  const decoded = new Uint8Array(value.length)
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    assertValid(ch in CHARSET_INVERSE_INDEX, `Invalid value: ${ch}.`)
    decoded[i] = CHARSET_INVERSE_INDEX[ch]
  }
  return decoded
}

function prefixToArray(prefix: string): number[] {
  const result: number[] = []
  for (let i = 0; i < prefix.length; i++) {
    result.push(prefix.charCodeAt(i) & 31)
  }
  return result
}

function checksumToArray(checksum: number): number[] {
  const result: number[] = []
  for (let i = 0; i < 8; i++) {
    result.push(checksum & 31)
    checksum /= 32
  }
  return result.reverse()
}

function polymod(data: Uint8Array): number {
  let c0 = 0
  let c1 = 1
  let c = 0

  for (let j = 0; j < data.length; j++) {
    c = c0 >>> 3
    c0 &= 0x07
    c0 <<= 5
    c0 |= c1 >>> 27
    c1 &= 0x07ffffff
    c1 <<= 5
    c1 ^= data[j]

    for (let i = 0; i < GENERATOR1.length; i++) {
      if (c & (1 << i)) {
        c0 ^= GENERATOR1[i]
        c1 ^= GENERATOR2[i]
      }
    }
  }

  c1 ^= 1
  if (c1 < 0) {
    c1 ^= 1 << 31
    c1 += (1 << 30) * 2
  }

  return c0 * (1 << 30) * 4 + c1
}

function hasValidChecksum(prefix: string, payload: Uint8Array): boolean {
  const prefixData = prefixToArray(prefix)
  const data = new Uint8Array(prefix.length + 1 + payload.length)
  data.set(prefixData)
  data.set([0], prefixData.length)
  data.set(payload, prefixData.length + 1)
  return polymod(data) === 0
}

function normalizeAddress(address: string): { prefix: string; encodedPayload: string } {
  assertValid(hasSingleCase(address), 'Mixed case address')
  const normalized = address.toLowerCase()
  const pieces = normalized.split(':')
  assertValid(pieces.length === 2, `Invalid address format: ${address}`)
  return { prefix: pieces[0], encodedPayload: pieces[1] }
}

export interface DecodedKaspaAddress {
  prefix: string
  version: number
  payload: Uint8Array
}

export function decodeKaspaAddress(
  address: string,
  allowedPrefixes: string[] = DEFAULT_ALLOWED_PREFIXES
): DecodedKaspaAddress {
  const { prefix, encodedPayload } = normalizeAddress(address)
  const normalizedPrefixes = allowedPrefixes.map((value) => value.toLowerCase())

  assertValid(normalizedPrefixes.includes(prefix), `Invalid address prefix: ${prefix}`)

  const decoded = base32Decode(encodedPayload)
  assertValid(hasValidChecksum(prefix, decoded), `Invalid checksum: ${address}`)

  const converted = convertBits(decoded.slice(0, -8), 5, 8, true)
  assertValid(converted.length > 0, 'Address payload is empty')

  return {
    prefix,
    version: converted[0],
    payload: converted.slice(1),
  }
}

export function encodeKaspaAddress(payload: Uint8Array, prefix: string, version = 0): string {
  const normalizedPrefix = prefix.toLowerCase()
  const prefixData = prefixToArray(normalizedPrefix).concat([0])
  const payloadData = convertBits(new Uint8Array([version, ...payload]), 8, 5, false)
  const checksumInput = new Uint8Array(prefixData.length + payloadData.length + 8)

  checksumInput.set(prefixData)
  checksumInput.set(payloadData, prefixData.length)

  const checksum = checksumToArray(polymod(checksumInput))
  const fullPayload = new Uint8Array(payloadData.length + checksum.length)
  fullPayload.set(payloadData)
  fullPayload.set(checksum, payloadData.length)

  return `${normalizedPrefix}:${base32Encode(fullPayload)}`
}

export function publicKeyToKaspaAddress(publicKey: Uint8Array, prefix: string): string {
  return encodeKaspaAddress(publicKey, prefix, 0x00)
}

export function addressToScriptPublicKey(
  address: string,
  allowedPrefixes: string[] = DEFAULT_ALLOWED_PREFIXES
): Uint8Array {
  const decoded = decodeKaspaAddress(address, allowedPrefixes)

  switch (decoded.version) {
    case 0x00:
      assertValid(decoded.payload.length === 32, 'Invalid Schnorr public key length')
      return new Uint8Array([0x20, ...decoded.payload, 0xac])
    case 0x01:
      assertValid(decoded.payload.length === 33, 'Invalid ECDSA public key length')
      return new Uint8Array([0x21, ...decoded.payload, 0xab])
    case 0x08:
      assertValid(decoded.payload.length === 32, 'Invalid script hash length')
      return new Uint8Array([0xaa, 0x20, ...decoded.payload, 0x87])
    default:
      throw new Error(`Unsupported address version: ${decoded.version}`)
  }
}

export function isKaspaAddressForNetwork(address: string, network: KaspaNetwork): boolean {
  try {
    decodeKaspaAddress(address, [network.prefix])
    return true
  } catch {
    return false
  }
}
