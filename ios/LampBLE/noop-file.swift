import CoreBluetooth
import Foundation
import Security

private struct ArcMeshKeySnapshot: Codable {
	let key: String
	let index: UInt16
	let name: String
	let boundNetKey: UInt16?
}

private struct ArcMeshNodeSnapshot: Codable {
	let uuid: String
	let name: String
	let deviceKey: String
	let unicastAddress: UInt16
	let publishAddress: UInt16
	let isProxyNode: Bool
	let configComplete: Bool
	let blacklisted: Bool
	let cid: String?
	let pid: String?
	let vid: String?
	let crpl: String?
}

private struct ArcMeshGroupSnapshot: Codable {
	let name: String
	let address: UInt16
}

private struct ArcMeshNetworkSnapshot: Codable {
	let schemaVersion: Int
	let meshName: String
	let meshUUID: String
	let ivIndex: UInt32
	let useDefaultSecurityCredentials: Bool
	let netKeys: [ArcMeshKeySnapshot]
	let appKeys: [ArcMeshKeySnapshot]
	let nodes: [ArcMeshNodeSnapshot]
	let groups: [ArcMeshGroupSnapshot]
}

private enum ArcMeshSecureStore {
	private static let service = "com.arcmotion.lampble.mesh"
	private static let account = "arc-local-network-v1"

	static func load() -> Data? {
		let query: [String: Any] = [
			kSecClass as String: kSecClassGenericPassword,
			kSecAttrService as String: service,
			kSecAttrAccount as String: account,
			kSecReturnData as String: true,
			kSecMatchLimit as String: kSecMatchLimitOne,
		]
		var result: CFTypeRef?
		guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
		return result as? Data
	}

	@discardableResult
	static func save(_ data: Data) -> Bool {
		let identity: [String: Any] = [
			kSecClass as String: kSecClassGenericPassword,
			kSecAttrService as String: service,
			kSecAttrAccount as String: account,
		]
		let update: [String: Any] = [kSecValueData as String: data]
		let updated = SecItemUpdate(identity as CFDictionary, update as CFDictionary)
		if updated == errSecSuccess { return true }
		guard updated == errSecItemNotFound else { return false }
		var item = identity
		item[kSecValueData as String] = data
		item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
		return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
	}
}

@objcMembers
final class ArcMeshNativeCoordinator: NSObject {
	private static let arcCompanyId: UInt16 = 0x1234
	private static let arcModelId: UInt32 = 0x0001
	private static let arcGroupAddress: UInt16 = 0xC123
	private static let defaultProvisionerAddress: UInt16 = 0x0001
	private static let defaultAppKeyIndex: UInt16 = 0
	private static let defaultNetKeyIndex: UInt16 = 0

	typealias PromiseCompletion = (NSDictionary?, NSError?) -> Void
	typealias EventHandler = (NSString, NSDictionary) -> Void

	private var meshManager: STMeshManager!
	private var provisioner: STMeshProvisioner!
	private var configurationModel: STMeshConfigurationModel!
	private var vendorModel: STMeshVendorModel!
	private var eventHandler: EventHandler?
	private var networkSettings: STMeshNetworkSettings!
	private var pendingNodesById: [String: STMeshNode] = [:]
	private var provisionedNodesById: [String: STMeshNode] = [:]
	private var requestedUnicastAddress: UInt16?
	private var activeNodeId: String?
	private var pendingLinkCompletion: PromiseCompletion?
	private var pendingIdentifyCompletion: PromiseCompletion?
	private var pendingProvisionCompletion: PromiseCompletion?
	private var pendingProxyCompletion: PromiseCompletion?
	private var pendingRouteCompletion: PromiseCompletion?
	private var pendingRouteProbeAddress: UInt16?
	private var pendingRouteGatewayAddress: UInt16?
	private var didInitializeNetwork = false

	override init() {
		super.init()
		meshManager = STMeshManager.getInstance(self)
		provisioner = meshManager.getProvisioner()
		configurationModel = meshManager.getConfigurationModel()
		vendorModel = meshManager.getVendorModel()
		provisioner.delegate = self
		configurationModel.delegate = self
		vendorModel.delegate = self
		meshManager.getLogger()?.delegate = self
		initializeNetworkIfNeeded()
	}

	func setEventHandler(_ handler: @escaping EventHandler) {
		eventHandler = handler
	}

	func beginUnprovisionedScan() {
		initializeNetworkIfNeeded()
		let status = provisioner.startDeviceScan(15)
			emitStatus("ST_SCAN_START", nodeId: nil, detail: "ARC scan status: \(status.rawValue)")
	}

	func stopUnprovisionedScan() {
		_ = provisioner.stopDeviceScan()
	}

	func listUnprovisionedNodes() -> NSArray {
		return pendingNodesById.values.map { node in
			let id = normalizedId(node.nodeUUID)
			return [
				"id": id,
				"uuid": id,
					"name": node.nodeName.isEmpty ? "ARC Node" : node.nodeName,
				"rssi": NSNumber(value: 0),
				"meshProvisioningAdvertised": NSNumber(value: true),
				"meshProxyAdvertised": NSNumber(value: false),
					"source": "ARC"
			] as NSDictionary
		} as NSArray
	}

	func openProvisioningLink(
		nodeId: String,
		peripheral: CBPeripheral?,
		name: String?,
		meshUuid: String?,
		completion: @escaping PromiseCompletion
	) {
		initializeNetworkIfNeeded()
		let id = normalizedId(meshUuid ?? nodeId)
		let node = pendingNodesById[id] ?? makeNode(id: id, name: name)
		pendingNodesById[id] = node
		activeNodeId = id
		pendingLinkCompletion = completion
		emitStatus("PB_GATT_OPENING", nodeId: id, detail: "Opening ARC commissioning link.")
		let status = provisioner.connectProvisoner(node, attentionTimer: 4)
		if status != STMeshStatus_Success {
			pendingLinkCompletion = nil
			completion(nil, error(code: "LINK_FAILED", message: "ARC commissioning link failed with status \(status.rawValue)."))
		}
	}

	func identifyNode(_ nodeId: String, completion: @escaping PromiseCompletion) {
		let id = normalizedId(nodeId)
		guard let node = pendingNodesById[id] else {
			completion(nil, error(code: "NODE_NOT_FOUND", message: "ARC device \(nodeId) was not found. Scan again before identifying."))
			return
		}
		activeNodeId = id
		pendingIdentifyCompletion = completion
		emitStatus("REQUESTING_CAPABILITIES", nodeId: id, detail: "Sending ARC commissioning invite.")
		let status = provisioner.sendProvisioningInvite(node, attentionTimer: 3)
		if status != STMeshStatus_Success {
			pendingIdentifyCompletion = nil
			completion(nil, error(code: "IDENTIFY_FAILED", message: "ARC commissioning invite failed with status \(status.rawValue)."))
		}
	}

	func setProvisioningUnicastAddress(_ address: NSNumber?, completion: @escaping PromiseCompletion) {
		requestedUnicastAddress = address?.uint16Value
		completion(nil, nil)
	}

	func provision(nodeId: String, staticOobHex: String?, completion: @escaping PromiseCompletion) {
		let id = normalizedId(nodeId)
		guard let node = pendingNodesById[id] else {
			completion(nil, error(code: "NODE_NOT_FOUND", message: "ARC device \(nodeId) was not found. Scan again before commissioning."))
			return
		}
		if let staticOobHex = staticOobHex, !staticOobHex.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
			completion(nil, error(code: "OOB_UNSUPPORTED", message: "The first ARC commissioning path supports No OOB only. Static OOB wiring comes next if the firmware requires it."))
			return
		}
		let address = requestedUnicastAddress ?? nextUnicastAddress()
		node.unicastAddress = address
		activeNodeId = id
		pendingProvisionCompletion = completion
		emitStatus("PROVISIONING", nodeId: id, detail: String(format: "Commissioning ARC device at local address 0x%04X.", address))
		let status = provisioner.provisionDevice(node, deviceAddress: address, identificationTime: 3)
		if status != STMeshStatus_Success {
			pendingProvisionCompletion = nil
			completion(nil, error(code: "PROVISION_FAILED", message: "ARC commissioning failed with status \(status.rawValue)."))
		}
	}

	func listNodes() -> NSArray {
		let knownNodes = mergedProvisionedNodes()
		return knownNodes.map { node in
			let id = normalizedId(node.nodeUUID.isEmpty ? String(format: "%04X", node.unicastAddress) : node.nodeUUID)
			return [
				"id": id,
				"uuid": id,
				"name": node.nodeName.isEmpty ? "ARC Node" : node.nodeName,
				"unicastAddress": NSNumber(value: node.unicastAddress),
				"unicastHex": String(format: "0x%04X", node.unicastAddress),
				"abbreviation": "AM",
				"color": "#22c55e",
				"provisioned": NSNumber(value: true),
				"connected": NSNumber(value: meshManager.isConnectedToProxyService()),
				"lastSeen": NSNumber(value: Date().timeIntervalSince1970 * 1000.0)
			] as NSDictionary
		} as NSArray
	}

	func connectProxy(peripheral: CBPeripheral?, completion: @escaping PromiseCompletion) {
		initializeNetworkIfNeeded()
		pendingProxyCompletion = completion
		emitStatus("PROXY_OPENING", nodeId: activeNodeId, detail: "Starting ARC local transport.")
		let preferred = activeNodeId.flatMap { provisionedNodesById[$0]?.unicastAddress } ?? 0
		let status = meshManager.startNetwork(preferred)
		if status != STMeshStatus_Success {
			pendingProxyCompletion = nil
			completion(nil, error(code: "PROXY_FAILED", message: "ARC local transport start failed with status \(status.rawValue)."))
		}
	}

	func disconnectProxy(completion: @escaping PromiseCompletion) {
		let status = meshManager.stopNetwork()
		if status != STMeshStatus_Success && status != STMeshStatus_False {
			completion(nil, error(code: "PROXY_DISCONNECT_FAILED", message: "ARC local transport stop failed with status \(status.rawValue)."))
			return
		}
		emitStatus("PROXY_CLOSED", nodeId: activeNodeId, detail: "ARC local transport stopped.")
		completion(nil, nil)
	}

	func sendVendorMessage(params: NSDictionary, completion: @escaping PromiseCompletion) {
		guard let nodeId = params["nodeId"] as? String,
			let opcodeNumber = params["opcode"] as? NSNumber else {
			completion(nil, error(code: "VENDOR_BAD_PARAMS", message: "Vendor send requires nodeId and opcode."))
			return
		}
		let node = tryResolveNode(nodeId)
		guard let node = node else {
			completion(nil, error(code: "NODE_NOT_FOUND", message: "Commissioned ARC node \(nodeId) was not found."))
			return
		}
		let payload = (params["payloadBase64"] as? String).flatMap { Data(base64Encoded: $0) } ?? Data()
		let status = vendorModel.setRemoteData(
			node.unicastAddress,
			usingOpcode: UInt32(opcodeNumber.uint8Value),
			send: payload,
			isResponseNeeded: false
		)
		if status == STMeshStatus_Success || status == STMeshStatus_False {
			completion(["sent": true, "transport": "ARC"], nil)
		} else {
			completion(nil, error(code: "VENDOR_SEND_FAILED", message: "ARC local command send failed with status \(status.rawValue)."))
		}
	}

	func configureProbeGatewayRoute(params: NSDictionary, completion: @escaping PromiseCompletion) {
		guard let probeNodeId = params["probeNodeId"] as? String,
			let gatewayNodeId = params["gatewayNodeId"] as? String,
			let probe = tryResolveNode(probeNodeId),
			let gateway = tryResolveNode(gatewayNodeId) else {
			completion(nil, error(code: "ROUTE_BAD_PARAMS", message: "Route config requires commissioned Probe and Gateway ARC nodes."))
			return
		}
		pendingRouteCompletion = completion
		pendingRouteProbeAddress = probe.unicastAddress
		pendingRouteGatewayAddress = gateway.unicastAddress
		let vendorModelId = Self.arcVendorModelId
		emitStatus("ROUTE_CONFIGURING", nodeId: probeNodeId, detail: String(format: "Configuring ARC route through local group 0x%04X.", Self.arcGroupAddress))
		let gatewayAppKey = configurationModel.addConfigAppKey(onNode: gateway.unicastAddress, appKeyIndex: Self.defaultAppKeyIndex, netKeyIndex: Self.defaultNetKeyIndex)
		let probeAppKey = configurationModel.addConfigAppKey(onNode: probe.unicastAddress, appKeyIndex: Self.defaultAppKeyIndex, netKeyIndex: Self.defaultNetKeyIndex)
		let gatewayBind = configurationModel.configAppBind(gateway.unicastAddress, elementAddress: gateway.unicastAddress, appkeyIndex: Self.defaultAppKeyIndex, modelIdentifier: vendorModelId, isVendorModelId: true)
		let probeBind = configurationModel.configAppBind(probe.unicastAddress, elementAddress: probe.unicastAddress, appkeyIndex: Self.defaultAppKeyIndex, modelIdentifier: vendorModelId, isVendorModelId: true)
		let subscription = configurationModel.addConfigModelSubscription(toNode: gateway.unicastAddress, elementAddress: gateway.unicastAddress, address: Self.arcGroupAddress, modelIdentifier: vendorModelId, isVendorModelId: true)
		let publication = configurationModel.setConfigModelPublicationOnNode(probe.unicastAddress, elementAddress: probe.unicastAddress, publishAddress: Self.arcGroupAddress, appKeyIndex: Self.defaultAppKeyIndex, credentialFlag: true, publishTTL: 5, publishPeriod: 0, retransmitCount: 2, retransmitInterval: 100, modelIdentifier: vendorModelId, isVendorModelId: true)
		let statuses = [gatewayAppKey, probeAppKey, gatewayBind, probeBind, subscription, publication]
		if statuses.contains(where: { $0 != STMeshStatus_Success && $0 != STMeshStatus_False }) {
			pendingRouteCompletion = nil
			completion(nil, error(code: "ROUTE_CONFIG_FAILED", message: "One or more ARC route configuration commands failed to enqueue: \(statuses.map { String($0.rawValue) }.joined(separator: ","))."))
			return
		}
		completion([
			"configured": true,
			"transport": "ARC",
			"detail": String(format: "ARC route commands queued: Probe 0x%04X publishes telemetry to group 0x%04X; Gateway 0x%04X subscribes.", probe.unicastAddress, Self.arcGroupAddress, gateway.unicastAddress)
		], nil)
		pendingRouteCompletion = nil
	}

	private static var arcVendorModelId: UInt32 {
		(UInt32(arcModelId) << 16) | UInt32(arcCompanyId)
	}

	private func initializeNetworkIfNeeded() {
		guard !didInitializeNetwork else { return }
		if let data = ArcMeshSecureStore.load(),
			let snapshot = try? JSONDecoder().decode(ArcMeshNetworkSnapshot.self, from: data),
			snapshot.schemaVersion == 1 {
			networkSettings = restoreNetworkSettings(from: snapshot)
		} else {
			networkSettings = STMeshNetworkSettings.initAsNewNetwork()
			networkSettings.meshName = "ARC Local Network"
			networkSettings.meshUUID = UUID().uuidString.replacingOccurrences(of: "-", with: "")
			networkSettings.iVindex = 1
			networkSettings.useDefaultSecuritiesCredential = true
		}
		ensureGroup(Self.arcGroupAddress, name: "ARC Probe Telemetry")
		_ = meshManager.createNetwork(Self.defaultProvisionerAddress)
		_ = meshManager.setNetworkData(networkSettings)
		_ = meshManager.enablePromiscuousMode(true)
		meshManager.setCurrentAppKeyIndex(Self.defaultAppKeyIndex)
		meshManager.setCurrentNetworkTTLValue(5)
		for node in mergedProvisionedNodes() {
			provisionedNodesById[normalizedId(node.nodeUUID)] = node
		}
		persistNetworkSettings()
		didInitializeNetwork = true
	}

	private func restoreNetworkSettings(from snapshot: ArcMeshNetworkSnapshot) -> STMeshNetworkSettings {
		let settings = STMeshNetworkSettings.initAsNewNetwork()
		settings.reinitNetworkDataList()
		settings.meshName = snapshot.meshName
		settings.meshUUID = snapshot.meshUUID
		settings.iVindex = snapshot.ivIndex
		settings.useDefaultSecuritiesCredential = snapshot.useDefaultSecurityCredentials
		for key in snapshot.netKeys {
			settings.netKeys.append(STMeshNetKey.initWithKey(key.key, index: key.index, name: key.name, oldKey: "", phase: 0, minSecurity: ""))
		}
		for key in snapshot.appKeys {
			settings.appkeys.append(STMeshAppKey.initWithKey(key.key, index: key.index, name: key.name, boundNetKey: Int(key.boundNetKey ?? 0)))
		}
		for stored in snapshot.nodes {
			let node = STMeshNode()
			node.nodeUUID = stored.uuid
			node.nodeName = stored.name
			node.deviceKey = stored.deviceKey
			node.unicastAddress = stored.unicastAddress
			node.publishAddress = stored.publishAddress
			node.isProxyNode = stored.isProxyNode
			node.configComplete = stored.configComplete
			node.blacklisted = stored.blacklisted
			node.cid = stored.cid
			node.pid = stored.pid
			node.vid = stored.vid
			node.crpl = stored.crpl
			settings.nodes.add(node)
		}
		for stored in snapshot.groups {
			let group = STMeshGroup()
			group.groupName = stored.name
			group.groupAddress = stored.address
			settings.groups.add(group)
			settings.setGroupOnAddress(stored.address, group: group)
		}
		return settings
	}

	private func persistNetworkSettings() {
		let netKeys = networkSettings.netKeys.keys().map {
			ArcMeshKeySnapshot(key: $0.key, index: $0.index, name: $0.name, boundNetKey: nil)
		}
		let appKeys = networkSettings.appkeys.keys().map {
			let appKey = $0 as? STMeshAppKey
			return ArcMeshKeySnapshot(key: $0.key, index: $0.index, name: $0.name, boundNetKey: appKey?.boundNetkey)
		}
		let nodes = mergedProvisionedNodes().map {
			ArcMeshNodeSnapshot(
				uuid: $0.nodeUUID, name: $0.nodeName, deviceKey: $0.deviceKey,
				unicastAddress: $0.unicastAddress, publishAddress: $0.publishAddress,
				isProxyNode: $0.isProxyNode, configComplete: $0.configComplete, blacklisted: $0.blacklisted,
				cid: $0.cid, pid: $0.pid, vid: $0.vid, crpl: $0.crpl
			)
		}
		let groups = networkSettings.groups.compactMap { item -> ArcMeshGroupSnapshot? in
			guard let group = item as? STMeshGroup else { return nil }
			return ArcMeshGroupSnapshot(name: group.groupName, address: group.groupAddress)
		}
		let snapshot = ArcMeshNetworkSnapshot(
			schemaVersion: 1, meshName: networkSettings.meshName, meshUUID: networkSettings.meshUUID,
			ivIndex: networkSettings.iVindex, useDefaultSecurityCredentials: networkSettings.useDefaultSecuritiesCredential,
			netKeys: netKeys, appKeys: appKeys, nodes: nodes, groups: groups
		)
		if let data = try? JSONEncoder().encode(snapshot) {
			_ = ArcMeshSecureStore.save(data)
		}
	}

	private func ensureGroup(_ address: UInt16, name: String) {
		if networkSettings.getGroupWithGroupAddress(address) != nil { return }
		let group = STMeshGroup()
		group.groupAddress = address
		group.groupName = name
		networkSettings.groups.add(group)
		networkSettings.setGroupOnAddress(address, group: group)
	}

	private func makeNode(id: String, name: String?) -> STMeshNode {
		let node = STMeshNode()
		node.nodeUUID = normalizedId(id)
		node.nodeName = name?.isEmpty == false ? name! : "ARC Node"
		node.unicastAddress = requestedUnicastAddress ?? nextUnicastAddress()
		return node
	}

	private func normalizedId(_ id: String) -> String {
		let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
		return trimmed.replacingOccurrences(of: "-", with: "").uppercased()
	}

	private func nextUnicastAddress() -> UInt16 {
		let used = Set(mergedProvisionedNodes().map { $0.unicastAddress })
		var candidate: UInt16 = 0x0002
		while used.contains(candidate) {
			candidate &+= 1
		}
		return candidate
	}

	private func tryResolveNode(_ nodeId: String) -> STMeshNode? {
		let id = normalizedId(nodeId)
		if let node = provisionedNodesById[id] ?? pendingNodesById[id] {
			return node
		}
		if let address = UInt16(nodeId.replacingOccurrences(of: "0x", with: ""), radix: 16) {
			return mergedProvisionedNodes().first { $0.unicastAddress == address }
		}
		return mergedProvisionedNodes().first { normalizedId($0.nodeUUID) == id }
	}

	private func mergedProvisionedNodes() -> [STMeshNode] {
		var nodes: [STMeshNode] = []
		if let storedNodes = networkSettings?.nodes as? [STMeshNode] {
			nodes.append(contentsOf: storedNodes)
		}
		nodes.append(contentsOf: provisionedNodesById.values)
		var byId: [String: STMeshNode] = [:]
		for node in nodes {
			let id = normalizedId(node.nodeUUID.isEmpty ? String(format: "%04X", node.unicastAddress) : node.nodeUUID)
			byId[id] = node
		}
		return Array(byId.values).sorted { $0.unicastAddress < $1.unicastAddress }
	}

	private func finishProvisioning(node: STMeshNode) {
		let id = normalizedId(node.nodeUUID)
		pendingNodesById[id] = nil
		provisionedNodesById[id] = node
		if !networkSettings.nodes.contains(where: { ($0 as? STMeshNode)?.nodeUUID == node.nodeUUID }) {
			networkSettings.nodes.add(node)
		}
		persistNetworkSettings()
		let result = [
			"id": id,
			"uuid": id,
			"name": node.nodeName.isEmpty ? "ARC Node" : node.nodeName,
			"unicastAddress": NSNumber(value: node.unicastAddress),
			"unicastHex": String(format: "0x%04X", node.unicastAddress),
			"abbreviation": "AM",
			"color": "#22c55e",
			"provisioned": NSNumber(value: true),
			"connected": NSNumber(value: false),
			"lastSeen": NSNumber(value: Date().timeIntervalSince1970 * 1000.0)
		] as NSDictionary
		emitStatus("PROVISIONING_COMPLETE", nodeId: id, detail: "ARC commissioning completed.")
		emit("MeshProvisioned", result as! [String: Any])
		pendingProvisionCompletion?(result, nil)
		pendingProvisionCompletion = nil
	}

	private func emitStatus(_ state: String, nodeId: String?, detail: String?) {
		var body: [String: Any] = ["state": state]
		if let nodeId = nodeId { body["nodeId"] = nodeId }
		if let detail = detail { body["detail"] = detail }
		emit("MeshProvisioningState", body)
		if let detail = detail {
			emit("MeshProvisioningDebug", ["message": "ARC: \(detail)"])
		}
	}

	private func emit(_ event: String, _ body: [String: Any]) {
		DispatchQueue.main.async { [weak self] in
			self?.eventHandler?(event as NSString, body as NSDictionary)
		}
	}

	private func error(code: String, message: String) -> NSError {
		NSError(domain: "ArcMeshNativeCoordinator", code: 1, userInfo: [
			NSLocalizedDescriptionKey: message,
			"code": code
		])
	}
}

extension ArcMeshNativeCoordinator: STMeshManagerDelegate {
	func meshManager(_ manager: STMeshManager!, didBTStateChange status: STMeshBleRadioState) {
		emitStatus("BLE_STATE", nodeId: activeNodeId, detail: "ARC BLE state: \(status.rawValue)")
	}

	func meshManager(_ manager: STMeshManager!, didProxyConnectionChanged isConnected: Bool) {
		emitStatus(isConnected ? "PROXY_OPEN" : "PROXY_CLOSED", nodeId: activeNodeId, detail: isConnected ? "ARC local transport connected." : "ARC local transport disconnected.")
		if isConnected, let completion = pendingProxyCompletion {
			pendingProxyCompletion = nil
				completion(["connected": true, "transport": "ARC"], nil)
		}
	}

	func meshManager(_ manager: STMeshManager!, didErrorOccurred errMessage: String!) {
		emitStatus("ERROR", nodeId: activeNodeId, detail: errMessage ?? "ARC local transport error.")
		let error = self.error(code: "ST_MESH_ERROR", message: errMessage ?? "ARC local transport error.")
		pendingLinkCompletion?(nil, error)
		pendingLinkCompletion = nil
		pendingIdentifyCompletion?(nil, error)
		pendingIdentifyCompletion = nil
		pendingProvisionCompletion?(nil, error)
		pendingProvisionCompletion = nil
		pendingProxyCompletion?(nil, error)
		pendingProxyCompletion = nil
	}

	func meshManager(_ manager: STMeshManager!, didProxyNodeAddressRetrieved strUUID: String!, peerAddress: UInt16) {
		emitStatus("PROXY_NODE", nodeId: normalizedId(strUUID ?? ""), detail: String(format: "ARC local node 0x%04X connected.", peerAddress))
	}
}

extension ArcMeshNativeCoordinator: STMeshProvisionerDelegate {
	func provisioner(_ provisioner: STMeshProvisioner!, didDeviceAppearedWithUUID uuid: String!, deviceName: String!, rssi RSSI: Int32) {
		let id = normalizedId(uuid ?? UUID().uuidString)
		let node = pendingNodesById[id] ?? makeNode(id: id, name: deviceName)
		node.nodeUUID = id
		node.nodeName = deviceName?.isEmpty == false ? deviceName! : node.nodeName
		pendingNodesById[id] = node
		emit("MeshProvisioningDebug", ["message": "ARC scan saw \(node.nodeName) \(id) RSSI \(RSSI)", "nodeId": id])
	}

	func provisioner(_ provisioner: STMeshProvisioner!, didProvisionStageChanged percentage: Int32, updateMessage message: String!, hasError errorFlag: Bool) {
		let nodeId = activeNodeId
		emitStatus(errorFlag ? "PROVISIONING_ERROR" : "PROVISIONING", nodeId: nodeId, detail: message ?? "ARC commissioning \(percentage)%")
		if errorFlag {
			pendingProvisionCompletion?(nil, error(code: "PROVISION_FAILED", message: message ?? "ARC commissioning failed."))
			pendingProvisionCompletion = nil
			return
		}
		if percentage >= 100, let nodeId = activeNodeId, let node = pendingNodesById[nodeId] {
			finishProvisioning(node: node)
		}
	}

	func provisioner(_ provisioner: STMeshProvisioner!, didReceiveCapabilitesElementCount elementCount: UInt8, publicKeyType: UInt8, staticOobType: UInt8, outputOobSz: UInt8, outputOobAction: UInt16, inputOobSz: UInt8, inputOobAction: UInt16) {
		emit("MeshProvisioningCapabilities", [
			"nodeId": activeNodeId ?? "",
			"elements": NSNumber(value: elementCount),
			"publicKeyType": NSNumber(value: publicKeyType),
			"staticOob": NSNumber(value: staticOobType != 0),
			"outputOobSize": NSNumber(value: outputOobSz),
			"inputOobSize": NSNumber(value: inputOobSz)
		])
		pendingIdentifyCompletion?(nil, nil)
		pendingIdentifyCompletion = nil
	}

	func provisioner(_ provisioner: STMeshProvisioner!, provisionerDidConnectToDevice strDeviceName: String!) {
		emitStatus("PB_GATT_LINK_OPEN", nodeId: activeNodeId, detail: "ARC commissioning link connected to \(strDeviceName ?? "device").")
		pendingLinkCompletion?(nil, nil)
		pendingLinkCompletion = nil
	}

	func provisioner(onRecievingProvisioningFailedStatus provisioner: STMeshProvisioner!) {
		pendingProvisionCompletion?(nil, error(code: "PROVISION_FAILED", message: "ARC commissioning failed."))
		pendingProvisionCompletion = nil
	}

	func provisioner(onRecievingProvisioningInputCompleteStatus provisioner: STMeshProvisioner!) {
		emit("MeshProvisioningAuth", ["nodeId": activeNodeId ?? "", "complete": true])
	}

	func provisioner(_ provisionerOnRecieveProvisioningPublicKeyExchageStatus: STMeshProvisioner!) {
		emitStatus("PROVISIONING_PUBLIC_KEY", nodeId: activeNodeId, detail: "ARC commissioning public key exchange completed.")
	}
}

extension ArcMeshNativeCoordinator: STMeshVendorModelDelegate {
	func vendorModel(_ vendorModel: STMeshVendorModel!, didReceiveResponseFromAddress peerAddress: UInt16, usingOpcode opcode: UInt8, recvData data: Data!) {
		emit("MeshTelemetry", [
			"nodeId": normalizedId(String(format: "%04X", peerAddress)),
			"source": NSNumber(value: peerAddress),
			"opcode": NSNumber(value: opcode),
			"payloadBase64": data?.base64EncodedString() ?? ""
		])
		emit("MeshProvisioningDebug", [
			"message": String(format: "ARC local response opcode 0x%02X from 0x%04X", opcode, peerAddress),
			"source": NSNumber(value: peerAddress),
			"opcode": NSNumber(value: opcode),
			"payloadBase64": data?.base64EncodedString() ?? ""
		])
	}

	func vendorModel(_ vendorModel: STMeshVendorModel!, didReceiveMessageFromAddress sourceAddress: UInt16, toDestination destinationAddress: UInt16, usingOpcode opcode: UInt8, data: Data!, msgType: VendorModelMsgTypes) {
		emit("MeshTelemetry", [
			"nodeId": normalizedId(String(format: "%04X", sourceAddress)),
			"source": NSNumber(value: sourceAddress),
			"destination": NSNumber(value: destinationAddress),
			"opcode": NSNumber(value: opcode),
			"payloadBase64": data?.base64EncodedString() ?? ""
		])
		emit("MeshProvisioningDebug", [
			"message": String(format: "ARC local RX opcode 0x%02X from 0x%04X to 0x%04X", opcode, sourceAddress, destinationAddress),
			"source": NSNumber(value: sourceAddress),
			"destination": NSNumber(value: destinationAddress),
			"opcode": NSNumber(value: opcode),
			"payloadBase64": data?.base64EncodedString() ?? ""
		])
	}
}

extension ArcMeshNativeCoordinator: STMeshConfigModelDelegate {
	func meshConfigModel(_ configModel: STMeshConfigurationModel!, didReceiveSubscriptionStatus configurationStatus: ConfigModelStatus, peerAddress: UInt16, elementAddress elementAdrress: UInt16, modelIdentifier: UInt32) {
		emitStatus("CONFIG_SUBSCRIPTION_STATUS", nodeId: activeNodeId, detail: "ARC route subscription status \(configurationStatus.rawValue) for model 0x\(String(modelIdentifier, radix: 16)).")
	}

	func meshConfigModel(_ configModel: STMeshConfigurationModel!, didReceivePublishStatus configurationStatus: ConfigModelStatus, peerAddress: UInt16, elementAddress: UInt16, publishAddress: UInt16, appKeyIndex: UInt16, credentialFlag: Bool, publishTTL: UInt8, publishPeriod: UInt32, retransmitCount count: UInt8, retransmitInterval interval: UInt16, modelIdentifier: UInt32) {
		emitStatus("CONFIG_PUBLICATION_STATUS", nodeId: activeNodeId, detail: String(format: "ARC route publication status %u: 0x%04X -> 0x%04X.", configurationStatus.rawValue, peerAddress, publishAddress))
	}

	func meshConfigModel(_ configModel: STMeshConfigurationModel!, didReceiveAppKeyStatus configurationStatus: ConfigModelStatus, peerAddress: UInt16, netKeyIndex: UInt16, appkeyIndex appKeyIndex: UInt16) {
		emitStatus("CONFIG_APPKEY_STATUS", nodeId: activeNodeId, detail: String(format: "ARC app key status %u for node 0x%04X.", configurationStatus.rawValue, peerAddress))
	}

	func meshConfigModel(_ configModel: STMeshConfigurationModel!, didReceiveConfigAppKeyBindStatus peerAddress: UInt16, elementAdress elementAdreess: UInt16, status: ConfigModelStatus, appKeyIndex: UInt16, modelId modelIdentifier: UInt32) {
		emitStatus("CONFIG_BIND_STATUS", nodeId: activeNodeId, detail: String(format: "ARC route bind status %u for model 0x%08X on 0x%04X.", status.rawValue, modelIdentifier, peerAddress))
	}

	func meshConfigModel(_ configModel: STMeshConfigurationModel!, didReceiveCompositionData configurationStatus: STMeshStatus, peerAddress: UInt16, pageNumber: UInt8, receivedData data: STMeshCompositionDataModel!) {
		emitStatus("COMPOSITION_STATUS", nodeId: activeNodeId, detail: String(format: "ARC node composition status %u from 0x%04X.", configurationStatus.rawValue, peerAddress))
	}
}

extension ArcMeshNativeCoordinator: STMeshLoggerDelegate {
	func didReceivedLoggerMessage(_ message: String!, direction: LogerDirection, logTime timeInterval: TimeInterval, logModule: LogModuleIDs, isErrorLog isErrorMessage: Bool, data: Data!) {
		if isErrorMessage || logModule == VendorModels || logModule == ConfigModels || logModule == Provisioning || logModule == Proxy {
			emit("MeshProvisioningDebug", ["message": "ARC: \(message ?? "local transport log")"])
		}
	}
}
