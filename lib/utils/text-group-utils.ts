
function escapeHtml(unsafe: string) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export type MessageSnippet = {
    label?: string,
    message: string
}

export const countStrLength = (str: string) => {
    let length = 0
    for (let s of str) {
        if (s === '>' || s === '<') {
            length += 4
        } else if (s === '&') {
            length += 5
        } else {
            length += s.length
        }
    }
    return length
}

export const countLength = (arg: MessageSnippet[]) => {
    let length = 0
    for (let seg of arg) {
        if (seg.label != null) {
            // 11 => <pre></pre>
            length += (11 + countStrLength(seg.label))
        }

        length += countStrLength(seg.message)
        // 2 => \n\n
        length += 2
    }
    return length
}

export const formalizeMessage = (msgs: MessageSnippet[]) => {
    const out = []
    let prev: MessageSnippet | null = null

    for (let item of msgs) {
        if (prev != null && item.label === prev!.label) {
            prev!.message += item.message
        } else {
            const clone = {
                ...item
            }
            out.push(clone)
            prev = clone
        }
    }

    return out
}

export const groupMessage = (msgs: MessageSnippet[], limit: number) => {
    type labeledMessageGroup = {
        full: boolean,
        group: MessageSnippet[]
    }
    const formatted = formalizeMessage(msgs)
    let grouped: labeledMessageGroup[] = []
    let currentGroup: labeledMessageGroup = {
        full: false,
        group: []
    }

    grouped.push(currentGroup)

    for (let item of formatted) {
        const newLength = countLength(formalizeMessage([...currentGroup.group, item]))
        if (newLength < limit - 100) {
            currentGroup.group.push(item)
        } else if (newLength < limit) {
            currentGroup.group.push(item)
            currentGroup.full = true
            currentGroup = {
                full: false,
                group: []
            }
            grouped.push(currentGroup)
        } else {
            // cut it

            const overflow = newLength - limit

            const captured: MessageSnippet = {
                label: item.label,
                message: item.message.slice(0, item.message.length - overflow)
            }

            currentGroup.group.push(captured)

            const remain: MessageSnippet = {
                label: item.label,
                message: item.message.slice(-overflow)
            }

            formatted.push(remain)

            currentGroup.full = true
            currentGroup = {
                full: false,
                group: []
            }
            grouped.push(currentGroup)
        }
    }

    if (grouped[grouped.length - 1]!.group.length === 0) {
        grouped.pop()
    }

    return grouped
}

export const formatMessage = (msgs: MessageSnippet[]) => {
    let msg = ''
    for (let item of msgs) {
        if (item.label != null) {
            msg += escapeHtml(item.label)
        }
        msg += '<pre>'
        msg += escapeHtml(item.message)
        msg += '</pre>'
    }
    return msg
}