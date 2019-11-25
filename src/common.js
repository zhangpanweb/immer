export const NOTHING =
	typeof Symbol !== "undefined"
		? Symbol("immer-nothing")
		: { ["immer-nothing"]: true }

export const DRAFTABLE =
	typeof Symbol !== "undefined" && Symbol.for
		? Symbol.for("immer-draftable")
		: "__$immer_draftable"

export const DRAFT_STATE =
	typeof Symbol !== "undefined" && Symbol.for
		? Symbol.for("immer-state")
		: "__$immer_state"

export function isDraft(value) {
	return !!value && !!value[DRAFT_STATE]
}

/**
 * 判断值是 plain object（包括数组） 或者 Map 或者 Set 或者 immer内部构造的对象
 */
export function isDraftable(value) {
	if (!value) return false
	return (
		isPlainObject(value) ||
		!!value[DRAFTABLE] ||
		!!value.constructor[DRAFTABLE] ||
		isMap(value) ||
		isSet(value)
	)
}

export function isPlainObject(value) {
	// 如果value不存在或者类型不是Object，返回false
	if (!value || typeof value !== "object") return false
	// 是数组，返回 true
	if (Array.isArray(value)) return true
	const proto = Object.getPrototypeOf(value)
	// 是 typeof value === "object" 并且 
	// proto 不存在，用 Object.create(null)创建的对象
	// proto === Object.prototype 说明是直接的对象，不是由其他构造函数构造的
	return !proto || proto === Object.prototype
}

export function original(value) {
	if (value && value[DRAFT_STATE]) {
		return value[DRAFT_STATE].base
	}
	// otherwise return undefined
}

// We use Maps as `drafts` for Sets, not Objects
// See proxy.js
export function assignSet(target, override) {
	override.forEach(value => {
		// When we add new drafts we have to remove their originals if present
		const prev = original(value)
		if (prev) target.delete(prev)
		target.add(value)
	})
	return target
}

// We use Maps as `drafts` for Maps, not Objects
// See proxy.js
export function assignMap(target, override) {
	override.forEach((value, key) => target.set(key, value))
	return target
}

export const assign =
	Object.assign ||
	((target, ...overrides) => {
		overrides.forEach(override =>
			Object.keys(override).forEach(key => (target[key] = override[key]))
		)
		return target
	})

/**
 * ownKeys方法
 * 如果环境中有 Reflect，则使用 Reflect.ownKeys
 * 否则，如果环境中有 Object.getOwnPropertySymbols 方法，则通过 getOwnPropertyNames 和 getOwnPropertySymbols，获取属性名和Symbol属性的集合
 * 否则，获取全部属性名
 */
export const ownKeys =
	typeof Reflect !== "undefined" && Reflect.ownKeys
		? Reflect.ownKeys
		: typeof Object.getOwnPropertySymbols !== "undefined"
			? obj =>
				Object.getOwnPropertyNames(obj).concat(
					Object.getOwnPropertySymbols(obj)
				)
			: Object.getOwnPropertyNames

/**
 * 浅复制
 */
export function shallowCopy(base, invokeGetters = false) {
	// 如果是 Array ，直接通过 slice 方法复制
	if (Array.isArray(base)) return base.slice()

	if (isMap(base)) return new Map(base)
	if (isSet(base)) return new Set(base)

	// clone，设置原型
	const clone = Object.create(Object.getPrototypeOf(base))
	// 复制属性
	ownKeys(base).forEach(key => {
		if (key === DRAFT_STATE) {
			return // Never copy over draft state.
		}
		const desc = Object.getOwnPropertyDescriptor(base, key)
		let { value } = desc

		// 复制getter
		if (desc.get) {
			if (!invokeGetters) {
				throw new Error("Immer drafts cannot have computed properties")
			}
			value = desc.get.call(base)
		}
		// 复制可枚举属性
		if (desc.enumerable) {
			clone[key] = value
		} else {
			// 通过 defineProperty 定义其他属性
			Object.defineProperty(clone, key, {
				value,
				writable: true,
				configurable: true
			})
		}
	})
	return clone
}

export function each(obj, iter) {
	if (Array.isArray(obj) || isMap(obj) || isSet(obj)) {
		// 如果是 Array、Map、Set，使用原生的 forEach 方法
		obj.forEach((entry, index) => iter(index, entry, obj))
	} else {
		// 否则keys数组然后 forEach
		ownKeys(obj).forEach(key => iter(key, obj[key], obj))
	}
}

export function isEnumerable(base, prop) {
	const desc = Object.getOwnPropertyDescriptor(base, prop)
	return !!desc && desc.enumerable
}

/**
 * 判断是否 thing 是否有 prop
 * 是 Map则用 has 判断，否则使用 Object.prototype.hasOwnProperty
 */
export function has(thing, prop) {
	return isMap(thing)
		? thing.has(prop)
		: Object.prototype.hasOwnProperty.call(thing, prop)
}

export function get(thing, prop) {
	return isMap(thing) ? thing.get(prop) : thing[prop]
}

export function is(x, y) {
	// From: https://github.com/facebook/fbjs/blob/c69904a511b900266935168223063dd8772dfc40/packages/fbjs/src/core/shallowEqual.js
	if (x === y) {
		return x !== 0 || 1 / x === 1 / y
	} else {
		// 处理 NaN
		return x !== x && y !== y
	}
}

export const hasSymbol = typeof Symbol !== "undefined"

export const hasMap = typeof Map !== "undefined"

/**
 * 判断值是 Map 类型
 */
export function isMap(target) {
	return hasMap && target instanceof Map
}

export const hasSet = typeof Set !== "undefined"

/**
 * 判断值是 Map 类型
 */
export function isSet(target) {
	return hasSet && target instanceof Set
}

export function makeIterable(next) {
	let self
	return (self = {
		[Symbol.iterator]: () => self,
		next
	})
}

/** Map.prototype.values _-or-_ Map.prototype.entries */
export function iterateMapValues(state, prop, receiver) {
	const isEntries = prop !== "values"
	return () => {
		const iterator = latest(state)[Symbol.iterator]()
		return makeIterable(() => {
			const result = iterator.next()
			if (!result.done) {
				const [key] = result.value
				const value = receiver.get(key)
				result.value = isEntries ? [key, value] : value
			}
			return result
		})
	}
}

export function makeIterateSetValues(createProxy) {
	function iterateSetValues(state, prop) {
		const isEntries = prop === "entries"
		return () => {
			const iterator = latest(state)[Symbol.iterator]()
			return makeIterable(() => {
				const result = iterator.next()
				if (!result.done) {
					const value = wrapSetValue(state, result.value)
					result.value = isEntries ? [value, value] : value
				}
				return result
			})
		}
	}

	function wrapSetValue(state, value) {
		const key = original(value) || value
		let draft = state.drafts.get(key)
		if (!draft) {
			if (state.finalized || !isDraftable(value) || state.finalizing) {
				return value
			}
			draft = createProxy(value, state)
			state.drafts.set(key, draft)
			if (state.modified) {
				state.copy.add(draft)
			}
		}
		return draft
	}

	return iterateSetValues
}

function latest(state) {
	return state.copy || state.base
}

export function clone(obj) {
	if (!isDraftable(obj)) return obj
	if (Array.isArray(obj)) return obj.map(clone)
	if (isMap(obj)) return new Map(obj)
	if (isSet(obj)) return new Set(obj)
	const cloned = Object.create(Object.getPrototypeOf(obj))
	for (const key in obj) cloned[key] = clone(obj[key])
	return cloned
}

/**
 * freeze obj
 */
export function freeze(obj, deep = false) {
	if (!isDraftable(obj) || isDraft(obj) || Object.isFrozen(obj)) return
	// Set 和 Map 通过重写对应方法实现 freeze
	if (isSet(obj)) {
		obj.add = obj.clear = obj.delete = dontMutateFrozenCollections
	} else if (isMap(obj)) {
		obj.set = obj.clear = obj.delete = dontMutateFrozenCollections
	}
	Object.freeze(obj)
	// 如果 deep = true，则循环 freeze 其属性值
	if (deep) each(obj, (_, value) => freeze(value, true))
}

function dontMutateFrozenCollections() {
	throw new Error("This object has been frozen and should not be mutated")
}
