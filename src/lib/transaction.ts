import { blake2b } from '@noble/hashes/blake2b'
import { Buffer } from 'buffer'
import { secp256k1, schnorr } from '@noble/curves/secp256k1'
import { addressToScriptPublicKey } from './address'

const TRANSACTION_SIGNING_HASH_KEY = Buffer.from('TransactionSigningHash')

const SIGHASH_ALL = 0b00000001
const SIGHASH_NONE = 0b00000010
const SIGHASH_SINGLE = 0b00000100
const SIGHASH_ANYONECANPAY = 0b10000000
const SIGHASH_MASK = 0b00000111
const DEFAULT_SUBNETWORK_ID = '0000000000000000000000000000000000000000'

function blake2b256(data: Uint8Array, key?: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: 32, key })
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

function hexToBytes(hex: string): Uint8Array {
  return Buffer.from(hex, 'hex')
}

function isSigHashNone(hashType: number): boolean {
  return (hashType & SIGHASH_MASK) === SIGHASH_NONE
}

function isSigHashSingle(hashType: number): boolean {
  return (hashType & SIGHASH_MASK) === SIGHASH_SINGLE
}

function isSigHashAnyoneCanPay(hashType: number): boolean {
  return (hashType & SIGHASH_ANYONECANPAY) === SIGHASH_ANYONECANPAY
}

interface HashCache {
  previousOutputsHash?: Uint8Array
  sequencesHash?: Uint8Array
  sigOpCountsHash?: Uint8Array
  outputsHash?: Uint8Array
}

class HashWriter {
  private length = 0
  private chunks: Buffer[] = []

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks, this.length)
  }

  private writeRaw(buffer: Buffer): this {
    this.chunks.push(buffer)
    this.length += buffer.length
    return this
  }

  writeHash(hash: Uint8Array): this {
    return this.writeRaw(Buffer.from(hash))
  }

  writeVarBytes(buffer: Uint8Array): this {
    this.writeUInt64LE(BigInt(buffer.length))
    return this.writeRaw(Buffer.from(buffer))
  }

  writeUInt8(value: number): this {
    const buffer = Buffer.alloc(1)
    buffer.writeUInt8(value)
    return this.writeRaw(buffer)
  }

  writeUInt16LE(value: number): this {
    const buffer = Buffer.alloc(2)
    buffer.writeUInt16LE(value)
    return this.writeRaw(buffer)
  }

  writeUInt32LE(value: number): this {
    const buffer = Buffer.alloc(4)
    buffer.writeUInt32LE(value, 0)
    return this.writeRaw(buffer)
  }

  writeUInt64LE(value: bigint): this {
    const buffer = Buffer.alloc(8)
    buffer.writeBigUInt64LE(value)
    return this.writeRaw(buffer)
  }

  finalize(): Uint8Array {
    return blake2b256(this.toBuffer(), TRANSACTION_SIGNING_HASH_KEY)
  }
}

function zeroHash(): Uint8Array {
  return new Uint8Array(32)
}

function zeroSubnetworkId(): Uint8Array {
  return new Uint8Array(20)
}

interface SerializableInput {
  previousOutpoint: {
    transactionId: string
    index: number
  }
  signatureScript: string
  sequence: number
  sigOpCount: number
}

interface SerializableOutput {
  amount: bigint
  scriptPublicKey: {
    version: number
    scriptPublicKey: string
  }
}

interface SigningUtxo {
  scriptPublicKey: Uint8Array
  amount: bigint
}

interface SerializableTransaction {
  version: number
  inputs: SerializableInput[]
  outputs: SerializableOutput[]
  lockTime: bigint
  subnetworkId: string
  utxos: SigningUtxo[]
}

function hashOutpoint(writer: HashWriter, input: SerializableInput): void {
  writer.writeHash(hexToBytes(input.previousOutpoint.transactionId))
  writer.writeUInt32LE(input.previousOutpoint.index)
}

function hashOutput(writer: HashWriter, output: SerializableOutput): void {
  writer.writeUInt64LE(output.amount)
  writer.writeUInt16LE(output.scriptPublicKey.version)
  writer.writeVarBytes(hexToBytes(output.scriptPublicKey.scriptPublicKey))
}

function getPreviousOutputsHash(
  transaction: SerializableTransaction,
  hashType: number,
  cache: HashCache
): Uint8Array {
  if (isSigHashAnyoneCanPay(hashType)) {
    return zeroHash()
  }

  if (!cache.previousOutputsHash) {
    const writer = new HashWriter()
    transaction.inputs.forEach((input) => hashOutpoint(writer, input))
    cache.previousOutputsHash = writer.finalize()
  }

  return cache.previousOutputsHash
}

function getSequencesHash(
  transaction: SerializableTransaction,
  hashType: number,
  cache: HashCache
): Uint8Array {
  if (isSigHashSingle(hashType) || isSigHashAnyoneCanPay(hashType) || isSigHashNone(hashType)) {
    return zeroHash()
  }

  if (!cache.sequencesHash) {
    const writer = new HashWriter()
    transaction.inputs.forEach((input) => writer.writeUInt64LE(BigInt(input.sequence)))
    cache.sequencesHash = writer.finalize()
  }

  return cache.sequencesHash
}

function getSigOpCountsHash(
  transaction: SerializableTransaction,
  hashType: number,
  cache: HashCache
): Uint8Array {
  if (isSigHashAnyoneCanPay(hashType)) {
    return zeroHash()
  }

  if (!cache.sigOpCountsHash) {
    const writer = new HashWriter()
    transaction.inputs.forEach(() => writer.writeUInt8(1))
    cache.sigOpCountsHash = writer.finalize()
  }

  return cache.sigOpCountsHash
}

function getOutputsHash(
  transaction: SerializableTransaction,
  inputIndex: number,
  hashType: number,
  cache: HashCache
): Uint8Array {
  if (isSigHashNone(hashType)) {
    return zeroHash()
  }

  if (isSigHashSingle(hashType)) {
    if (inputIndex >= transaction.outputs.length) {
      return zeroHash()
    }

    const writer = new HashWriter()
    hashOutput(writer, transaction.outputs[inputIndex])
    return writer.finalize()
  }

  if (!cache.outputsHash) {
    const writer = new HashWriter()
    transaction.outputs.forEach((output) => hashOutput(writer, output))
    cache.outputsHash = writer.finalize()
  }

  return cache.outputsHash
}

function calculateSigHash(
  transaction: SerializableTransaction,
  hashType: number,
  inputIndex: number,
  cache: HashCache
): Uint8Array {
  const writer = new HashWriter()
  const input = transaction.inputs[inputIndex]
  const utxo = transaction.utxos[inputIndex]

  writer.writeUInt16LE(transaction.version)
  writer.writeHash(getPreviousOutputsHash(transaction, hashType, cache))
  writer.writeHash(getSequencesHash(transaction, hashType, cache))
  writer.writeHash(getSigOpCountsHash(transaction, hashType, cache))

  hashOutpoint(writer, input)
  writer.writeUInt16LE(0)
  writer.writeVarBytes(utxo.scriptPublicKey)
  writer.writeUInt64LE(utxo.amount)
  writer.writeUInt64LE(BigInt(input.sequence))
  writer.writeUInt8(1)

  writer.writeHash(getOutputsHash(transaction, inputIndex, hashType, cache))
  writer.writeUInt64LE(transaction.lockTime)
  writer.writeHash(zeroSubnetworkId())
  writer.writeUInt64LE(0n)
  writer.writeHash(zeroHash())
  writer.writeUInt8(hashType)

  return writer.finalize()
}

function toSafeBigInt(value: number | string | bigint): bigint {
  if (typeof value === 'bigint') {
    return value
  }
  return BigInt(value)
}

export interface TransactionSigningInput {
  txId: string
  vOut: number
  address: string
  amount: number
}

export interface TransactionSigningOutput {
  address: string
  amount: number
}

export interface TransactionSigningParams {
  inputs: TransactionSigningInput[]
  outputs: TransactionSigningOutput[]
  changeAddress: string
  fee: number
  privateKey: Uint8Array
  addressPrefixes: string[]
  dustThreshold?: number
}

export interface SignedTransactionPayload {
  transaction: {
    version: number
    inputs: SerializableInput[]
    outputs: Array<{
      amount: string
      scriptPublicKey: {
        version: number
        scriptPublicKey: string
      }
    }>
    lockTime: string
    subnetworkId: string
  }
  allowOrphan: boolean
}

export function buildSignedTransaction(params: TransactionSigningParams): SignedTransactionPayload {
  if (!secp256k1.utils.isValidPrivateKey(params.privateKey)) {
    throw new Error('Invalid private key')
  }

  if (params.inputs.length === 0) {
    throw new Error('No inputs available for transaction')
  }

  if (params.outputs.length === 0) {
    throw new Error('No outputs provided')
  }

  const fee = toSafeBigInt(params.fee)
  if (fee < 0n) {
    throw new Error('Fee cannot be negative')
  }

  const transaction: SerializableTransaction = {
    version: 0,
    inputs: [],
    outputs: [],
    lockTime: 0n,
    subnetworkId: DEFAULT_SUBNETWORK_ID,
    utxos: [],
  }

  let totalInput = 0n
  for (const input of params.inputs) {
    const amount = toSafeBigInt(input.amount)
    const script = addressToScriptPublicKey(input.address, params.addressPrefixes)

    transaction.inputs.push({
      previousOutpoint: {
        transactionId: input.txId,
        index: input.vOut,
      },
      signatureScript: '',
      sequence: 0,
      sigOpCount: 1,
    })
    transaction.utxos.push({
      scriptPublicKey: script,
      amount,
    })
    totalInput += amount
  }

  let totalOutput = 0n
  for (const output of params.outputs) {
    const amount = toSafeBigInt(output.amount)
    if (amount <= 0n) {
      throw new Error('Output amount must be positive')
    }

    transaction.outputs.push({
      amount,
      scriptPublicKey: {
        version: 0,
        scriptPublicKey: bytesToHex(addressToScriptPublicKey(output.address, params.addressPrefixes)),
      },
    })
    totalOutput += amount
  }

  const changeAmount = totalInput - totalOutput - fee
  if (changeAmount < 0n) {
    throw new Error('Insufficient balance')
  }

  const dustThreshold = BigInt(params.dustThreshold ?? 546)
  if (changeAmount >= dustThreshold) {
    transaction.outputs.push({
      amount: changeAmount,
      scriptPublicKey: {
        version: 0,
        scriptPublicKey: bytesToHex(addressToScriptPublicKey(params.changeAddress, params.addressPrefixes)),
      },
    })
  }

  const cache: HashCache = {}
  transaction.inputs.forEach((input, index) => {
    const sigHash = calculateSigHash(transaction, SIGHASH_ALL, index, cache)
    const signature = schnorr.sign(sigHash, params.privateKey)

    input.signatureScript = bytesToHex(new Uint8Array([0x41, ...signature, SIGHASH_ALL]))
  })

  return {
    transaction: {
      version: transaction.version,
      inputs: transaction.inputs,
      outputs: transaction.outputs.map((output) => ({
        amount: output.amount.toString(),
        scriptPublicKey: output.scriptPublicKey,
      })),
      lockTime: transaction.lockTime.toString(),
      subnetworkId: transaction.subnetworkId,
    },
    allowOrphan: false,
  }
}
