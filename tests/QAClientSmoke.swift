import Foundation

@main struct QAClientSmoke {
    static func main() {
        let args = CommandLine.arguments
        guard args.count == 4 else { exit(64) }
        let client = QAClient(node: args[1], script: args[2], root: args[3], environment: ProcessInfo.processInfo.environment)
        var replies = 0, finished = false
        for _ in 0..<12 {
            client.request("health", params: [:]) { response in
                guard let result = response["result"] as? [String: Any], result["protocolVersion"] as? Int == 5 else { print("FAIL native QA client: \(response)"); exit(1) }
                replies += 1
                if replies == 12 {
                    client.request("unknown", params: [:]) { response in
                        guard response["error"] != nil else { exit(1) }
                        client.request("health", params: [:]) { response in
                            guard response["result"] != nil else { exit(1) }
                            client.request("shutdown", params: [:]) { response in
                                guard response["result"] != nil else { exit(1) }
                                client.close(); finished = true
                            }
                        }
                    }
                }
            }
        }
        let deadline = Date().addingTimeInterval(20)
        while !finished && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
        guard finished else { print("FAIL native QA client timeout"); client.close(); exit(1) }
        print("PASS native QA client: multiplexed stdio, correlated responses, error isolation and cleanup")
    }
}
