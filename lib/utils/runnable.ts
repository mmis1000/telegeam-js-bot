
export class Runnable<T> {
    running: boolean = false
    queue: T[] = []
    constructor (private cb: (arg: T, queue: T[]) => Promise<any>) {}

    private async doTask () {
        this.running = true

        let task
        while (task = this.queue.shift()) {
            try {
                await this.cb(task, this.queue)
            } catch (err) {}
        }

        this.running = false
    }

    updateQueue<U extends (tasks: T[]) => any> (cb: U): ReturnType<U> {
        let err: any, res: ReturnType<U>, success = true
        try {
            res = cb(this.queue)
        } catch (err_) {
            err = err_
            success = false
        }

        if (this.queue.length > 0 && !this.running) {
            this.doTask()
        }

        if (success) {
            return res!
        } else {
            throw err
        }
    }
}