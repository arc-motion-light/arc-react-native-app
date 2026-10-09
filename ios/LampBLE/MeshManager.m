#import "MeshManager.h"
#import "LampBLE-Swift.h"

#import <CoreBluetooth/CoreBluetooth.h>
#import <math.h>

@interface MeshManager () <CBCentralManagerDelegate, CBPeripheralDelegate>
@property(nonatomic, strong) CBCentralManager *centralManager;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSDictionary *> *scanResults;
@property(nonatomic, strong) NSMutableDictionary<NSString *, CBPeripheral *> *discoveredPeripherals;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSDictionary *> *provisionedNodes;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSString *> *provisionedPeripheralIds;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSString *> *routedTelemetryOwnerByProbe;
@property(nonatomic, strong) CBPeripheral *provisioningPeripheral;
@property(nonatomic, strong) CBPeripheral *telemetryPeripheral;
@property(nonatomic, strong) CBPeripheral *routeConfigPeripheral;
@property(nonatomic, strong) CBPeripheral *probeDiagnosticPeripheral;
@property(nonatomic, strong) CBCharacteristic *telemetryEnvCharacteristic;
@property(nonatomic, strong) CBCharacteristic *telemetryGatewayCharacteristic;
@property(nonatomic, strong) CBCharacteristic *routeThreadDebugCharacteristic;
@property(nonatomic, strong) CBCharacteristic *probeDiagnosticCharacteristic;
@property(nonatomic, strong) ArcMeshNativeCoordinator *meshCoordinator;
@property(nonatomic, copy) RCTPromiseResolveBlock scanResolve;
@property(nonatomic, copy) RCTPromiseRejectBlock scanReject;
@property(nonatomic, copy) RCTPromiseResolveBlock linkResolve;
@property(nonatomic, copy) RCTPromiseRejectBlock linkReject;
@property(nonatomic, copy) RCTPromiseResolveBlock routeResolve;
@property(nonatomic, copy) RCTPromiseRejectBlock routeReject;
@property(nonatomic, copy) NSString *linkNodeId;
@property(nonatomic, copy) NSString *routeProbeNodeId;
@property(nonatomic, copy) NSString *routeGatewayNodeId;
@property(nonatomic, copy) NSString *probeDiagnosticNodeId;
@property(nonatomic, assign) NSInteger routeMode;
@property(nonatomic, assign) BOOL routeShouldReadThreadDebug;
@property(nonatomic, copy) NSString *telemetryNodeId;
@property(nonatomic, copy) NSString *requestedTelemetryNodeId;
@property(nonatomic, strong) NSData *routePayload;
@property(nonatomic, strong) NSTimer *telemetryTimer;
@property(nonatomic, assign) NSInteger telemetryDiscoveryAttempt;
@property(nonatomic, assign) NSInteger nextUnicastAddress;
@property(nonatomic, assign) NSInteger telemetryConfigVersion;
@property(nonatomic, assign) double airTempC;
@property(nonatomic, assign) double humidityRh;
@property(nonatomic, assign) double syntheticTempC;
@property(nonatomic, assign) BOOL syntheticTempRising;
@property(nonatomic, assign) BOOL lampPower;
@property(nonatomic, strong) NSData *probeEnvData;
@property(nonatomic, strong) NSNumber *telemetryRssi;
@property(nonatomic, assign) BOOL hasListeners;
@end

@implementation MeshManager

RCT_EXPORT_MODULE(MeshManager)

- (instancetype)init
{
  if ((self = [super init])) {
    _scanResults = [NSMutableDictionary new];
    _discoveredPeripherals = [NSMutableDictionary new];
    _provisionedNodes = [NSMutableDictionary new];
    NSDictionary *storedPeripheralIds = [[NSUserDefaults standardUserDefaults] dictionaryForKey:@"ARCProvisionedPeripheralIdsV1"];
    _provisionedPeripheralIds = storedPeripheralIds != nil ? [storedPeripheralIds mutableCopy] : [NSMutableDictionary new];
    NSDictionary *storedTelemetryRoutes = [[NSUserDefaults standardUserDefaults] dictionaryForKey:@"ARCRoutedTelemetryOwnersV1"];
    _routedTelemetryOwnerByProbe = storedTelemetryRoutes != nil ? [storedTelemetryRoutes mutableCopy] : [NSMutableDictionary new];
    _nextUnicastAddress = 1;
    _airTempC = 25.0;
    _humidityRh = 50.0;
    _syntheticTempC = 25.0;
    _syntheticTempRising = YES;
    _lampPower = NO;
    _meshCoordinator = [ArcMeshNativeCoordinator new];
    __weak typeof(self) weakSelf = self;
    [_meshCoordinator setEventHandler:^(NSString *eventName, NSDictionary *body) {
      __strong typeof(weakSelf) self = weakSelf;
      if (self == nil || !self.hasListeners) {
        return;
      }
      [self sendEventWithName:(NSString *)eventName body:body];
    }];
  }
  return self;
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[
    @"MeshTelemetry",
    @"MeshConnection",
    @"MeshProvisioningState",
    @"MeshProvisioningCapabilities",
    @"MeshIdentify",
    @"MeshProvisioningAuth",
    @"MeshProvisioningIdentify",
    @"MeshProvisioningPdu",
    @"MeshProvisioningUnicast",
    @"MeshProvisioningDebug",
    @"MeshProvisioned"
  ];
}

- (void)startObserving
{
  self.hasListeners = YES;
}

- (void)stopObserving
{
  self.hasListeners = NO;
}

- (NSString *)nodeIdForPeripheral:(CBPeripheral *)peripheral
{
  if (peripheral == nil) return nil;
  if (peripheral == self.telemetryPeripheral && self.telemetryNodeId.length > 0) {
    return self.telemetryNodeId;
  }
  NSString *peripheralId = peripheral.identifier.UUIDString;
  for (NSString *nodeId in self.provisionedPeripheralIds) {
    if ([self.provisionedPeripheralIds[nodeId] isEqualToString:peripheralId]) return nodeId;
  }
  for (NSString *nodeId in self.discoveredPeripherals) {
    if (self.discoveredPeripherals[nodeId] == peripheral) return nodeId;
  }
  if (peripheral == self.provisioningPeripheral) return self.linkNodeId;
  return nil;
}

- (void)setNodeId:(NSString *)nodeId physicallyConnected:(BOOL)connected
{
  if (nodeId.length == 0) return;
  NSMutableDictionary *node = [self.provisionedNodes[nodeId] mutableCopy];
  if (node != nil) {
    node[@"connected"] = @(connected);
    self.provisionedNodes[nodeId] = node;
  }
  if (self.hasListeners) {
    [self sendEventWithName:@"MeshConnection" body:@{ @"nodeId": nodeId, @"connected": @(connected) }];
  }
}

// Read-only debug preflight. Physical connection alone is not SESSION_READY.
RCT_EXPORT_METHOD(getHistorySessionState:(NSString *)nodeId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    CBPeripheral *peripheral = self.telemetryPeripheral;
    if (peripheral == nil || peripheral.state != CBPeripheralStateConnected ||
        ![self.telemetryNodeId isEqualToString:nodeId]) {
      resolve(@"DISCONNECTED");
      return;
    }
    BOOL canWrite = NO;
    for (CBService *service in peripheral.services) {
      for (CBCharacteristic *characteristic in service.characteristics) {
        if ([characteristic.UUID isEqual:[self bleSensorLoaderRxCharacteristicUUID]] &&
            (characteristic.properties & (CBCharacteristicPropertyWrite | CBCharacteristicPropertyWriteWithoutResponse))) {
          canWrite = YES;
        }
      }
    }
    resolve(canWrite && self.telemetryGatewayCharacteristic.isNotifying ? @"SESSION_READY" : @"DISCOVERING");
  });
}

RCT_EXPORT_METHOD(initialize:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self ensureCentralManager];
    resolve([NSNull null]);
  });
}

RCT_EXPORT_METHOD(writeLoaderControl:(NSString *)nodeId
                  payloadBase64:(NSString *)payloadBase64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSData *payload = [[NSData alloc] initWithBase64EncodedString:payloadBase64 options:0];
    const uint8_t *bytes = payload.bytes;
    const BOOL manualChannels = payload.length == 10 && bytes != NULL && bytes[0] == 0x40;
    const BOOL manualFan = (payload.length == 3 || payload.length == 4 || payload.length == 10) && bytes != NULL && bytes[0] == 0x41;
    const BOOL preparePwmFrequency = payload.length == 10 && bytes != NULL && bytes[0] == 0x42;
    const BOOL manualPower = payload.length == 10 && bytes != NULL && bytes[0] == 0x43;
    const BOOL manualPowerTarget = payload.length == 10 && bytes != NULL && bytes[0] == 0x44;
    const BOOL historyStatus = payload.length == 2 && bytes != NULL && bytes[0] == 0x62 && bytes[1] == 0x01;
    const BOOL historyGet =
      bytes != NULL &&
      ((payload.length == 6 && bytes[0] == 0x64 && bytes[1] == 0x01) ||
       (payload.length == 11 && bytes[0] == 0x64 && bytes[1] == 0x02));
    const BOOL historyAck = payload.length == 6 && bytes != NULL && bytes[0] == 0x66 && bytes[1] == 0x01;
    const BOOL lampCadence = bytes != NULL && payload.length >= 2 && bytes[1] == 1 &&
      ((payload.length == 6 && bytes[0] == 0x74) || (payload.length == 12 && bytes[0] == 0x75));
    const BOOL openMeshShort = payload.length == 11 && bytes != NULL &&
      (bytes[0] == 0x01 || bytes[0] == 0x02 || bytes[0] == 0x10 || bytes[0] == 0x20);
    // Schema-3 Schedule is a complete 31-byte record.  The previous 18-byte
    // allowance was for the retired partial config payload, which meant every
    // current Schedule save was rejected before it reached the Lamp.  Reads
    // use the two-byte 0x32/schema request and must use the same Loader route.
    const BOOL openMeshConfigSet = payload.length == 31 && bytes != NULL && bytes[0] == 0x30;
    const BOOL openMeshConfigGet = payload.length == 2 && bytes != NULL && bytes[0] == 0x32 && bytes[1] == 0x03;
    if (!manualChannels && !manualFan && !preparePwmFrequency && !manualPower && !manualPowerTarget &&
        !historyStatus && !historyGet && !historyAck && !lampCadence && !openMeshShort && !openMeshConfigSet && !openMeshConfigGet) {
      reject(@"LOADER_CONTROL_PAYLOAD", @"Unsupported Loader RX command or payload length.", nil);
      return;
    }
    CBPeripheral *peripheral = [self routeConfigPeripheralForProbeNodeId:nodeId];
    if (peripheral == nil) {
      reject(@"LOADER_CONTROL_LINK", @"Lamp BLE link is not available.", nil);
      return;
    }
    if (self.routeResolve != nil) {
      reject(@"LOADER_CONTROL_BUSY", @"Another Loader RX write is in progress.", nil);
      return;
    }
    self.routeResolve = resolve;
    self.routeReject = reject;
    self.routeProbeNodeId = nodeId;
    self.routePayload = payload;
    self.routeConfigPeripheral = peripheral;
    self.routeShouldReadThreadDebug = NO;
    peripheral.delegate = self;
    if (peripheral.state == CBPeripheralStateConnected) {
      [peripheral discoverServices:@[[self bleSensorServiceUUID]]];
    } else {
      [self.centralManager connectPeripheral:peripheral options:nil];
    }
  });
}

RCT_EXPORT_METHOD(scanArcDevices:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self ensureCentralManager];

    if (self.scanResolve != nil) {
      reject(@"SCAN_IN_PROGRESS", @"Mesh scan already in progress.", nil);
      return;
    }

    if (self.centralManager.state != CBManagerStatePoweredOn) {
      reject(@"BLUETOOTH_NOT_READY", [self bluetoothStateMessage], nil);
      return;
    }

    [self.scanResults removeAllObjects];
    self.scanResolve = resolve;
    self.scanReject = reject;


    [self.centralManager scanForPeripheralsWithServices:nil
                          options:@{ CBCentralManagerScanOptionAllowDuplicatesKey: @NO }];

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(8.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      [self finishScan];
    });
  });
}

RCT_EXPORT_METHOD(listNodes:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSArray *nativeNodes = [self.meshCoordinator listNodes];
  if (nativeNodes.count > 0) {
    NSMutableArray *restored = [NSMutableArray arrayWithCapacity:nativeNodes.count];
    for (NSDictionary *nativeNode in nativeNodes) {
      NSMutableDictionary *node = [nativeNode mutableCopy];
      NSString *nodeId = node[@"id"];
      NSString *peripheralId = [nodeId isKindOfClass:NSString.class] ? self.provisionedPeripheralIds[nodeId] : nil;
      if (peripheralId.length > 0) node[@"blePeripheralId"] = peripheralId;
      // Provisioning state survives launches; physical BLE connection state
      // does not. CoreBluetooth callbacks establish the live value below.
      node[@"connected"] = @NO;
      if (nodeId.length > 0) self.provisionedNodes[nodeId] = node;
      [restored addObject:node];
    }
    resolve(restored);
    return;
  }
  NSMutableArray *offlineNodes = [NSMutableArray arrayWithCapacity:self.provisionedNodes.count];
  for (NSDictionary *storedNode in self.provisionedNodes.allValues) {
    NSMutableDictionary *node = [storedNode mutableCopy];
    NSString *nodeId = node[@"id"];
    node[@"connected"] = @NO;
    if (nodeId.length > 0) self.provisionedNodes[nodeId] = node;
    [offlineNodes addObject:node];
  }
  resolve(offlineNodes);
}

RCT_EXPORT_METHOD(identifyNode:(NSString *)nodeId resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.meshCoordinator identifyNode:nodeId completion:^(NSDictionary *result, NSError *error) {
    if (error != nil) {
      reject(error.userInfo[@"code"] ?: @"IDENTIFY_FAILED", error.localizedDescription, error);
      return;
    }
    if (self.hasListeners) {
      [self sendEventWithName:@"MeshIdentify" body:@{ @"nodeId": nodeId ?: [NSNull null], @"ok": @YES }];
      [self sendEventWithName:@"MeshProvisioningIdentify" body:@{ @"nodeId": nodeId ?: [NSNull null], @"ok": @YES }];
    }
    resolve(result ?: [NSNull null]);
  }];
}

RCT_EXPORT_METHOD(openProvisioningLink:(NSString *)nodeId resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSDictionary *scannedNode = self.scanResults[nodeId];
    CBPeripheral *peripheral = self.discoveredPeripherals[nodeId];
    if (peripheral == nil && scannedNode == nil) {
      reject(@"NODE_NOT_FOUND", @"Scanned peripheral is no longer available. Scan again before identifying.", nil);
      return;
    }

    if (self.linkResolve != nil) {
      reject(@"LINK_IN_PROGRESS", @"A provisioning link is already being opened.", nil);
      return;
    }

    NSString *name = scannedNode[@"name"];
    NSString *meshUuid = scannedNode[@"uuid"];
    if (scannedNode != nil && ![scannedNode[@"meshProvisioningAdvertised"] boolValue]) {
      reject(@"ARC_ROUTE_ONLY", @"This ARC device is advertising as a BLE app-facing route. Connect it as an ARC route.", nil);
      return;
    }
    self.provisioningPeripheral = peripheral;
    self.linkNodeId = nodeId;
    [self.meshCoordinator openProvisioningLinkWithNodeId:nodeId peripheral:peripheral name:name meshUuid:meshUuid completion:^(NSDictionary *result, NSError *error) {
      if (error != nil) {
        reject(error.userInfo[@"code"] ?: @"LINK_FAILED", error.localizedDescription, error);
        return;
      }
      resolve(result ?: [NSNull null]);
    }];
  });
}

RCT_EXPORT_METHOD(fetchCapabilities:(NSString *)nodeId resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.meshCoordinator identifyNode:nodeId completion:^(NSDictionary *result, NSError *error) {
    if (error != nil) {
      reject(error.userInfo[@"code"] ?: @"FETCH_CAPABILITIES_FAILED", error.localizedDescription, error);
      return;
    }
    resolve(result ?: [NSNull null]);
  }];
}

RCT_EXPORT_METHOD(setProvisioningUnicastAddress:(nonnull NSNumber *)address resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.meshCoordinator setProvisioningUnicastAddress:address completion:^(NSDictionary *result, NSError *error) {
    if (error != nil) {
      reject(error.userInfo[@"code"] ?: @"UNICAST_FAILED", error.localizedDescription, error);
      return;
    }
    resolve(result ?: [NSNull null]);
  }];
}

RCT_EXPORT_METHOD(setProvisioningUnicastAddressAuto:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.meshCoordinator setProvisioningUnicastAddress:nil completion:^(NSDictionary *result, NSError *error) {
    if (error != nil) {
      reject(error.userInfo[@"code"] ?: @"UNICAST_FAILED", error.localizedDescription, error);
      return;
    }
    resolve(result ?: [NSNull null]);
  }];
}

RCT_EXPORT_METHOD(provision:(NSString *)nodeId oobHex:(NSString *)oobHex resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self.meshCoordinator provisionWithNodeId:nodeId staticOobHex:oobHex completion:^(NSDictionary *result, NSError *error) {
      if (error != nil) {
        reject(error.userInfo[@"code"] ?: @"PROVISION_FAILED", error.localizedDescription, error);
        return;
      }
      if (result != nil) {
        NSMutableDictionary *storedResult = [result mutableCopy];
        NSString *resultNodeId = storedResult[@"id"] ?: nodeId;
        NSString *peripheralId = self.provisioningPeripheral.identifier.UUIDString;
        if (resultNodeId.length > 0 && peripheralId.length > 0) {
          self.provisionedPeripheralIds[resultNodeId] = peripheralId;
          [[NSUserDefaults standardUserDefaults] setObject:self.provisionedPeripheralIds forKey:@"ARCProvisionedPeripheralIdsV1"];
          storedResult[@"blePeripheralId"] = peripheralId;
        }
        self.provisionedNodes[resultNodeId] = storedResult;
        result = storedResult;
      }
      resolve(result ?: [NSNull null]);
    }];
  });
}

RCT_EXPORT_METHOD(connectProxy:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  CBPeripheral *peripheral = self.telemetryPeripheral ?: self.provisioningPeripheral ?: self.discoveredPeripherals.allValues.firstObject;
  [self.meshCoordinator connectProxyWithPeripheral:peripheral completion:^(NSDictionary *result, NSError *error) {
    if (error != nil) {
      reject(error.userInfo[@"code"] ?: @"PROXY_FAILED", error.localizedDescription, error);
      return;
    }
    resolve(result ?: [NSNull null]);
  }];
}

RCT_EXPORT_METHOD(disconnectProxy:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.meshCoordinator disconnectProxyWithCompletion:^(NSDictionary *result, NSError *error) {
    if (error != nil) {
      reject(error.userInfo[@"code"] ?: @"PROXY_DISCONNECT_FAILED", error.localizedDescription, error);
      return;
    }
    resolve(result ?: [NSNull null]);
  }];
}

- (CBPeripheral *)restorePeripheralForNodeId:(NSString *)nodeId
{
  if (nodeId.length == 0) return nil;
  CBPeripheral *peripheral = self.discoveredPeripherals[nodeId];
  if (peripheral != nil) return peripheral;

  NSString *storedPeripheralId = self.provisionedPeripheralIds[nodeId];
  if (storedPeripheralId.length == 0 && [[NSUUID alloc] initWithUUIDString:nodeId] != nil) {
    storedPeripheralId = nodeId;
  }
  NSUUID *uuid = storedPeripheralId.length > 0 ? [[NSUUID alloc] initWithUUIDString:storedPeripheralId] : nil;
  if (uuid == nil || self.centralManager == nil) return nil;

  peripheral = [[self.centralManager retrievePeripheralsWithIdentifiers:@[uuid]] firstObject];
  if (peripheral != nil) self.discoveredPeripherals[nodeId] = peripheral;
  return peripheral;
}

RCT_EXPORT_METHOD(connectNode:(NSString *)nodeId resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self ensureCentralManager];
    NSString *telemetryOwnerNodeId = self.routedTelemetryOwnerByProbe[nodeId] ?: nodeId;
    self.requestedTelemetryNodeId = telemetryOwnerNodeId;
    if (![telemetryOwnerNodeId isEqualToString:nodeId]) {
      [self emitDebug:nodeId message:[NSString stringWithFormat:@"[TelemetryOwner] routed Probe uses %@; keeping direct Probe BLE reserved for configuration.", telemetryOwnerNodeId]];
    }
    CBPeripheral *peripheral = [self restorePeripheralForNodeId:telemetryOwnerNodeId];
    if (peripheral == nil || self.centralManager.state != CBManagerStatePoweredOn) {
      [self setNodeId:telemetryOwnerNodeId physicallyConnected:NO];
      [self emitDebug:telemetryOwnerNodeId message:@"ARC connection pending: the telemetry owner is not currently available to CoreBluetooth."];
      resolve([NSNull null]);
      return;
    }
    [self setNodeId:telemetryOwnerNodeId physicallyConnected:(peripheral.state == CBPeripheralStateConnected)];
    [self emitDebug:telemetryOwnerNodeId message:@"ARC physical BLE connection requested for the active telemetry owner; waiting for CoreBluetooth confirmation."];
    [self startTelemetryForNode:telemetryOwnerNodeId];
    resolve([NSNull null]);
  });
}

RCT_EXPORT_METHOD(disconnectNode:(NSString *)nodeId resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *telemetryOwnerNodeId = self.routedTelemetryOwnerByProbe[nodeId] ?: nodeId;
    if ([self.telemetryNodeId isEqualToString:telemetryOwnerNodeId]) {
      [self stopTelemetry];
    }
    if ([self.requestedTelemetryNodeId isEqualToString:telemetryOwnerNodeId]) {
      self.requestedTelemetryNodeId = nil;
    }
    if (self.hasListeners) {
      [self sendEventWithName:@"MeshConnection" body:@{ @"nodeId": nodeId ?: [NSNull null], @"connected": @NO }];
    }
    resolve([NSNull null]);
  });
}

RCT_EXPORT_METHOD(sendVendorMessage:(NSDictionary *)params resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *payloadBase64 = params[@"payloadBase64"];
    NSData *payload = nil;
    if ([payloadBase64 isKindOfClass:NSString.class]) {
      payload = [[NSData alloc] initWithBase64EncodedString:payloadBase64 options:0];
    }

    if (payload.length >= 2) {
      const uint8_t *bytes = payload.bytes;
      uint8_t opcode = bytes[0];
      if ((opcode == 0x10u) && (payload.length >= 10) && ((bytes[1] & 0x01u) != 0u)) {
        self.lampPower = bytes[2] != 0u;
      } else if ((opcode == 0x01u || opcode == 0x03u) && (payload.length >= 10)) {
        self.telemetryConfigVersion = bytes[1];
        self.lampPower = (bytes[9] & 0x40u) != 0u;
      } else if ((opcode == 0x30u) && (payload.length >= 31)) {
        self.telemetryConfigVersion = bytes[1];
      } else if ((opcode == 0x20u) && (payload.length >= 6)) {
        self.telemetryConfigVersion = bytes[1] != 0u ? bytes[1] : self.telemetryConfigVersion;
      }
    }

    NSString *nodeId = params[@"nodeId"];
    if ([nodeId isKindOfClass:NSString.class]) {
      [self emitTelemetryForNode:nodeId];
    }

    [self.meshCoordinator sendVendorMessageWithParams:params completion:^(NSDictionary *result, NSError *error) {
      if (error != nil) {
        [self emitDebug:params[@"nodeId"] message:error.localizedDescription];
        reject(error.userInfo[@"code"] ?: @"VENDOR_SEND_FAILED", error.localizedDescription, error);
        return;
      }
      resolve(result ?: [NSNull null]);
    }];
  });
}

RCT_EXPORT_METHOD(readVendorStatus:(NSDictionary *)params resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *nodeId = params[@"nodeId"];
    if (![nodeId isKindOfClass:NSString.class] || nodeId.length == 0) {
      resolve([NSNull null]);
      return;
    }

    NSString *payloadBase64 = [self telemetryPayloadBase64ForNode:nodeId];
    resolve(@{ @"payloadBase64": payloadBase64 });
  });
}

RCT_EXPORT_METHOD(configureProbeGatewayRoute:(NSDictionary *)params resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *probeNodeId = params[@"probeNodeId"];
    NSString *gatewayNodeId = params[@"gatewayNodeId"];
    NSNumber *routeMode = params[@"routeMode"];
    CBPeripheral *probePeripheral = [self routeConfigPeripheralForProbeNodeId:probeNodeId];

    if (probePeripheral != nil && [gatewayNodeId isKindOfClass:NSString.class] && gatewayNodeId.length > 0) {
      [self configureProbeGatewayRouteOverArcBleWithProbeNodeId:probeNodeId
                                                  gatewayNodeId:gatewayNodeId
                                                     routeMode:routeMode
                                                    peripheral:probePeripheral
                                                      resolver:resolve
                                                      rejecter:reject];
      return;
    }

    reject(@"ARC_ROUTE_LINK_MISSING", @"The requested Probe BLE link is unavailable; no Mesh fallback was attempted.", nil);
  });
}

- (void)startTelemetryForNode:(NSString *)nodeId
{
  if (nodeId.length == 0) {
    return;
  }
  self.requestedTelemetryNodeId = nodeId;

  if ([self.telemetryNodeId isEqualToString:nodeId] && self.telemetryPeripheral != nil) {
    if (self.telemetryPeripheral.state == CBPeripheralStateConnected) {
      [self startTelemetryTimer];
      [self beginTelemetryDiscoveryForPeripheral:self.telemetryPeripheral];
    } else {
      [self.centralManager connectPeripheral:self.telemetryPeripheral options:nil];
    }
    return;
  }

  NSString *previousNodeId = self.telemetryNodeId;
  CBPeripheral *previousPeripheral = self.telemetryPeripheral;
  if (previousPeripheral != nil) {
    if (self.telemetryEnvCharacteristic != nil && self.telemetryEnvCharacteristic.isNotifying) {
      [previousPeripheral setNotifyValue:NO forCharacteristic:self.telemetryEnvCharacteristic];
    }
    if (self.telemetryGatewayCharacteristic != nil && self.telemetryGatewayCharacteristic.isNotifying) {
      [previousPeripheral setNotifyValue:NO forCharacteristic:self.telemetryGatewayCharacteristic];
    }
    if (previousPeripheral.state == CBPeripheralStateConnected &&
        previousPeripheral != self.routeConfigPeripheral &&
        previousPeripheral != self.probeDiagnosticPeripheral &&
        previousPeripheral != self.provisioningPeripheral) {
      [self.centralManager cancelPeripheralConnection:previousPeripheral];
    }
  }

  [self.telemetryTimer invalidate];
  self.telemetryTimer = nil;
  self.telemetryEnvCharacteristic = nil;
  self.telemetryGatewayCharacteristic = nil;
  self.telemetryRssi = nil;
  self.telemetryDiscoveryAttempt = 0;
  self.telemetryNodeId = nodeId;
  // ENV bytes belong to the peripheral that produced them. Never carry a
  // cached Probe frame across a switch to a Lamp/Gateway connection.
  self.probeEnvData = nil;
  self.telemetryPeripheral = [self restorePeripheralForNodeId:nodeId];
  self.telemetryPeripheral.delegate = self;

  if (self.telemetryPeripheral == nil || self.centralManager.state != CBManagerStatePoweredOn) {
    [self emitDebug:nodeId message:@"Telemetry source unavailable; retaining the known node as offline."];
    return;
  }

  [self emitDebug:nodeId message:[NSString stringWithFormat:@"[TelemetryOwner] %@ -> %@", previousNodeId ?: @"none", nodeId]];

  if (self.telemetryPeripheral.state == CBPeripheralStateConnected) {
    [self startTelemetryTimer];
    [self beginTelemetryDiscoveryForPeripheral:self.telemetryPeripheral];
  } else {
    [self.centralManager connectPeripheral:self.telemetryPeripheral options:nil];
  }
}

- (void)beginTelemetryDiscoveryForPeripheral:(CBPeripheral *)peripheral
{
  if (peripheral == nil || peripheral != self.telemetryPeripheral ||
      peripheral.state != CBPeripheralStateConnected) {
    return;
  }

  self.telemetryDiscoveryAttempt += 1;
  NSInteger attempt = self.telemetryDiscoveryAttempt;
  NSString *nodeId = self.telemetryNodeId;
  peripheral.delegate = self;
  [peripheral readRSSI];
  [peripheral discoverServices:@[[self bleSensorServiceUUID]]];
  [self emitDebug:nodeId message:[NSString stringWithFormat:
    @"[TelemetrySubscribe] service discovery attempt=%ld", (long)attempt]];

  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    if (peripheral != self.telemetryPeripheral ||
        ![nodeId isEqualToString:self.telemetryNodeId] ||
        self.telemetryGatewayCharacteristic != nil) {
      return;
    }
    if (self.telemetryDiscoveryAttempt < 3) {
      [self beginTelemetryDiscoveryForPeripheral:peripheral];
    } else {
      [self emitDebug:nodeId message:@"[TelemetrySubscribe][FAIL] Loader TX was not discovered after 3 attempts."];
    }
  });
}

- (void)startTelemetryTimer
{
  [self.telemetryTimer invalidate];
  self.telemetryTimer = [NSTimer scheduledTimerWithTimeInterval:1.0
                                                        target:self
                                                      selector:@selector(handleTelemetryTimer:)
                                                      userInfo:nil
                                                       repeats:YES];
}

- (void)stopTelemetry
{
  [self.telemetryTimer invalidate];
  self.telemetryTimer = nil;
  self.telemetryEnvCharacteristic = nil;
  self.telemetryRssi = nil;
  self.probeEnvData = nil;
  if (self.telemetryPeripheral != nil && self.telemetryPeripheral.state == CBPeripheralStateConnected) {
    [self.centralManager cancelPeripheralConnection:self.telemetryPeripheral];
  }
  self.telemetryPeripheral = nil;
  self.telemetryNodeId = nil;
  self.requestedTelemetryNodeId = nil;
  self.telemetryDiscoveryAttempt = 0;
}

- (void)handleTelemetryTimer:(NSTimer *)timer
{
  (void)timer;
  if (self.telemetryNodeId != nil) {
    if (self.telemetryPeripheral != nil && self.telemetryPeripheral.state == CBPeripheralStateConnected) {
      [self.telemetryPeripheral readRSSI];
    }
  }
}

- (void)advanceSyntheticTelemetry
{
  double next = self.syntheticTempC + (self.syntheticTempRising ? 0.1 : -0.1);
  if (next >= 30.0) {
    next = 30.0;
    self.syntheticTempRising = NO;
  } else if (next <= 25.0) {
    next = 25.0;
    self.syntheticTempRising = YES;
  }
  self.syntheticTempC = next;
}

- (void)emitTelemetryForNode:(NSString *)nodeId
{
  if (!self.hasListeners || nodeId.length == 0) {
    return;
  }

  NSString *payloadBase64 = [self telemetryPayloadBase64ForNode:nodeId];
  NSMutableDictionary *body = [@{ @"nodeId": nodeId, @"payloadBase64": payloadBase64 } mutableCopy];
  if (self.probeEnvData.length > 0) {
    body[@"probeEnvBase64"] = [self.probeEnvData base64EncodedStringWithOptions:0];
  }
  if (self.telemetryRssi != nil) {
    body[@"rssi"] = self.telemetryRssi;
  }
  [self sendEventWithName:@"MeshTelemetry" body:body];
}

- (NSString *)telemetryPayloadBase64ForNode:(NSString *)nodeId
{
  (void)nodeId;
  // Do not fabricate lamp measurements. Actual G4 telemetry reaches JS via
  // parseGatewayCharacteristicData and has a 15-byte extended status frame.
  NSMutableData *frame = [NSMutableData dataWithLength:15];
  uint8_t *bytes = frame.mutableBytes;

  bytes[0] = 0x03u;
  bytes[1] = (uint8_t)(self.telemetryConfigVersion & 0xff);
  bytes[9] = (uint8_t)(0x0cu | (self.lampPower ? 0x40u : 0x00u));
  bytes[10] = 0x00u; // core, board and INA241 power are unavailable until received from G4.
  return [frame base64EncodedStringWithOptions:0];
}

- (int16_t)tempX10:(double)value
{
  double clamped = fmax(-3276.8, fmin(3276.7, value));
  return (int16_t)lrint(clamped * 10.0);
}

- (void)storeInt16:(int16_t)value at:(uint8_t *)dest
{
  uint16_t raw = (uint16_t)value;
  dest[0] = (uint8_t)(raw & 0xffu);
  dest[1] = (uint8_t)((raw >> 8) & 0xffu);
}

- (CBUUID *)bleSensorServiceUUID
{
  return [CBUUID UUIDWithString:@"00000000-0001-11E1-9AB4-0002A5D5C51B"];
}

- (CBUUID *)bleSensorEnvCharacteristicUUID
{
  return [CBUUID UUIDWithString:@"000C0000-0001-11E1-AC36-0002A5D5C51B"];
}

- (CBUUID *)bleSensorLoaderRxCharacteristicUUID
{
  return [CBUUID UUIDWithString:@"01000000-0001-11E1-AC36-0002A5D5C51B"];
}

- (CBUUID *)bleSensorLoaderTxCharacteristicUUID
{
  return [CBUUID UUIDWithString:@"01000001-0001-11E1-AC36-0002A5D5C51B"];
}

- (CBUUID *)bleSensorThreadDebugCharacteristicUUID
{
  return [CBUUID UUIDWithString:@"00D00000-0001-11E1-AC36-0002A5D5C51B"];
}

- (uint32_t)readUInt32LE:(const uint8_t *)bytes
{
  return (uint32_t)bytes[0] |
         ((uint32_t)bytes[1] << 8) |
         ((uint32_t)bytes[2] << 16) |
         ((uint32_t)bytes[3] << 24);
}

- (void)emitProbeThreadDebug:(NSData *)data nodeId:(NSString *)nodeId
{
  if (data.length < 48) return;
  const uint8_t *bytes = data.bytes;
  if (bytes[0] != 0x54u || bytes[1] != 0x01u) return;
  uint8_t policy = (uint8_t)((bytes[3] >> 4) & 0x0fu);
  NSString *message = [NSString stringWithFormat:
    @"[ProbeThread] status=%u policy=%u role=%u init=%u ot_err=%u changes=%u tasklets=%u drivers=%u tx=%u/%u tx_err=%u seq=%u process=%u",
    bytes[2], policy,
    (unsigned int)[self readUInt32LE:&bytes[16]],
    (unsigned int)[self readUInt32LE:&bytes[8]],
    (unsigned int)[self readUInt32LE:&bytes[12]],
    (unsigned int)[self readUInt32LE:&bytes[20]],
    (unsigned int)[self readUInt32LE:&bytes[24]],
    (unsigned int)[self readUInt32LE:&bytes[28]],
    (unsigned int)[self readUInt32LE:&bytes[36]],
    (unsigned int)[self readUInt32LE:&bytes[32]],
    (unsigned int)[self readUInt32LE:&bytes[40]],
    (unsigned int)[self readUInt32LE:&bytes[44]],
    (unsigned int)[self readUInt32LE:&bytes[4]]];
  [self emitDebug:nodeId message:message];
}

- (NSData *)arcRouteSetPayloadForGatewayNodeId:(NSString *)gatewayNodeId routeMode:(NSNumber *)routeMode
{
  NSUInteger gatewayLength = MIN((NSUInteger)24, gatewayNodeId.length);
  NSInteger normalizedRouteMode = routeMode == nil ? 1 : routeMode.integerValue;
  NSMutableData *payload = [NSMutableData dataWithLength:4 + gatewayLength];
  uint8_t *bytes = payload.mutableBytes;
  bytes[0] = 0x52u;
  bytes[1] = 0x01u;
  bytes[2] = normalizedRouteMode == 0 ? 0x00u : 0x01u;
  bytes[3] = (uint8_t)gatewayLength;
  for (NSUInteger index = 0; index < gatewayLength; index += 1) {
    bytes[4 + index] = (uint8_t)([gatewayNodeId characterAtIndex:index] & 0xffu);
  }
  return payload;
}

- (CBPeripheral *)routeConfigPeripheralForProbeNodeId:(NSString *)probeNodeId
{
  if ([probeNodeId isKindOfClass:NSString.class] && probeNodeId.length > 0) {
    CBPeripheral *directMatch = self.discoveredPeripherals[probeNodeId];
    if (directMatch != nil) {
      return directMatch;
    }

    NSString *storedPeripheralId = self.provisionedPeripheralIds[probeNodeId];
    if (storedPeripheralId.length == 0 && [[NSUUID alloc] initWithUUIDString:probeNodeId] != nil) {
      storedPeripheralId = probeNodeId;
    }
    NSUUID *storedUuid = storedPeripheralId.length > 0
      ? [[NSUUID alloc] initWithUUIDString:storedPeripheralId]
      : nil;
    if (storedUuid != nil && self.centralManager.state == CBManagerStatePoweredOn) {
      CBPeripheral *restoredPeripheral = [[self.centralManager retrievePeripheralsWithIdentifiers:@[storedUuid]] firstObject];
      if (restoredPeripheral != nil) {
        self.discoveredPeripherals[probeNodeId] = restoredPeripheral;
        return restoredPeripheral;
      }
    }

    if ([self.telemetryNodeId isEqualToString:probeNodeId] && self.telemetryPeripheral != nil) {
      return self.telemetryPeripheral;
    }

    if ([self.linkNodeId isEqualToString:probeNodeId] && self.provisioningPeripheral != nil) {
      return self.provisioningPeripheral;
    }
  }

  return nil;
}

- (BOOL)isArcProbeAdvertisementName:(NSString *)name
{
  if (![name isKindOfClass:NSString.class]) {
    return NO;
  }

  return [name hasPrefix:@"ARC Probe"] ||
         [name isEqualToString:@"ARC_T"] ||
         [name localizedCaseInsensitiveContainsString:@"probe"] ||
         [name localizedCaseInsensitiveContainsString:@"sensor"];
}

- (void)configureProbeGatewayRouteOverArcBleWithProbeNodeId:(NSString *)probeNodeId
                                              gatewayNodeId:(NSString *)gatewayNodeId
                                                  routeMode:(NSNumber *)routeMode
                                                 peripheral:(CBPeripheral *)peripheral
                                                   resolver:(RCTPromiseResolveBlock)resolve
                                                   rejecter:(RCTPromiseRejectBlock)reject
{
  if (self.routeResolve != nil) {
    reject(@"ROUTE_CONFIG_IN_PROGRESS", @"An ARC BLE route configuration write is already in progress.", nil);
    return;
  }

  if (self.centralManager.state != CBManagerStatePoweredOn) {
    reject(@"BLUETOOTH_NOT_READY", [self bluetoothStateMessage], nil);
    return;
  }

  NSInteger normalizedRouteMode = routeMode == nil ? 1 : routeMode.integerValue;
  self.routeResolve = resolve;
  self.routeReject = reject;
  self.routeProbeNodeId = probeNodeId;
  self.routeGatewayNodeId = gatewayNodeId;
  self.routeMode = normalizedRouteMode == 0 ? 0 : 1;
  self.routePayload = [self arcRouteSetPayloadForGatewayNodeId:gatewayNodeId routeMode:routeMode];
  self.routeConfigPeripheral = peripheral;
  self.routeThreadDebugCharacteristic = nil;
  self.routeShouldReadThreadDebug = YES;
  peripheral.delegate = self;
  [self emitDebug:probeNodeId message:[NSString stringWithFormat:@"Writing ARC route-set 0x52 mode=%ld directly to Probe BLE Loader RX via %@.", (long)(normalizedRouteMode == 0 ? 0 : 1), peripheral.identifier.UUIDString]];

  if (peripheral.state == CBPeripheralStateConnected) {
    [peripheral discoverServices:@[[self bleSensorServiceUUID]]];
  } else {
    [self.centralManager connectPeripheral:peripheral options:nil];
  }
}

- (void)finishSuccessfulRouteConfig
{
  BOOL routeWrite = self.routeShouldReadThreadDebug;
  CBPeripheral *diagnosticPeripheral = routeWrite && self.routeMode == 1 ? self.routeConfigPeripheral : nil;
  CBCharacteristic *diagnosticCharacteristic = routeWrite && self.routeMode == 1 ? self.routeThreadDebugCharacteristic : nil;
  NSString *diagnosticNodeId = routeWrite && self.routeMode == 1 ? self.routeProbeNodeId : nil;
  if (diagnosticPeripheral != nil && diagnosticCharacteristic != nil && diagnosticNodeId.length > 0) {
    self.probeDiagnosticPeripheral = diagnosticPeripheral;
    self.probeDiagnosticCharacteristic = diagnosticCharacteristic;
    self.probeDiagnosticNodeId = diagnosticNodeId;
  }
  [self finishRouteConfigWithResult:@{
    @"configured": @YES,
    @"transport": @"ARC_BLE",
    @"detail": routeWrite
      ? (self.routeMode == 0
          ? @"Probe returned to standalone direct BLE mode."
          : @"ARC route-set 0x52 written to Probe BLE Loader RX. Waiting for routed Thread telemetry.")
      : @"ARC Loader RX command written over local BLE."
  } errorCode:nil message:nil];

  if (diagnosticPeripheral != nil && diagnosticCharacteristic != nil && diagnosticNodeId.length > 0) {
    [self emitDebug:diagnosticNodeId message:@"[ProbeThread] follow-up read scheduled in 8 seconds."];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(8.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      if (self.probeDiagnosticPeripheral != diagnosticPeripheral ||
          self.probeDiagnosticCharacteristic != diagnosticCharacteristic) return;
      if (diagnosticPeripheral.state == CBPeripheralStateConnected) {
        diagnosticPeripheral.delegate = self;
        [diagnosticPeripheral readValueForCharacteristic:diagnosticCharacteristic];
      } else {
        [self emitDebug:diagnosticNodeId message:@"[ProbeThread][FOLLOWUP_FAIL] Probe configuration link disconnected before diagnostic read."];
        self.probeDiagnosticPeripheral = nil;
        self.probeDiagnosticCharacteristic = nil;
        self.probeDiagnosticNodeId = nil;
      }
    });
  }
}

- (void)recordTelemetryRouteForProbe:(NSString *)probeNodeId
                       gatewayNodeId:(NSString *)gatewayNodeId
                           routeMode:(NSInteger)routeMode
{
  if (probeNodeId.length == 0) return;

  if (routeMode == 0) {
    [self.routedTelemetryOwnerByProbe removeObjectForKey:probeNodeId];
  } else if (gatewayNodeId.length > 0) {
    self.routedTelemetryOwnerByProbe[probeNodeId] = gatewayNodeId;
  }
  [[NSUserDefaults standardUserDefaults] setObject:self.routedTelemetryOwnerByProbe
                                            forKey:@"ARCRoutedTelemetryOwnersV1"];

  NSString *ownerNodeId = routeMode == 0 ? probeNodeId : gatewayNodeId;
  if (ownerNodeId.length > 0) {
    [self emitDebug:probeNodeId message:[NSString stringWithFormat:
      @"[TelemetryOwner] route mode=%ld owner=%@", (long)routeMode, ownerNodeId]];
    [self startTelemetryForNode:ownerNodeId];
  }
}

- (void)readRouteThreadDebugOrFinish
{
  if (!self.routeShouldReadThreadDebug) {
    [self finishSuccessfulRouteConfig];
    return;
  }
  CBPeripheral *peripheral = self.routeConfigPeripheral;
  CBCharacteristic *characteristic = self.routeThreadDebugCharacteristic;
  if (peripheral == nil || characteristic == nil) {
    [self finishSuccessfulRouteConfig];
    return;
  }
  [peripheral readValueForCharacteristic:characteristic];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    if (self.routeResolve != nil && self.routeConfigPeripheral == peripheral) {
      [self emitDebug:self.routeProbeNodeId message:@"[ProbeThread] debug read timed out after route-set."];
      [self finishSuccessfulRouteConfig];
    }
  });
}

- (void)finishRouteConfigWithResult:(NSDictionary *)result errorCode:(NSString *)errorCode message:(NSString *)message
{
  RCTPromiseResolveBlock resolve = self.routeResolve;
  RCTPromiseRejectBlock reject = self.routeReject;
  NSString *probeNodeId = self.routeProbeNodeId;
  NSString *gatewayNodeId = self.routeGatewayNodeId;
  NSInteger routeMode = self.routeMode;
  BOOL routeWrite = self.routeShouldReadThreadDebug;

  self.routeResolve = nil;
  self.routeReject = nil;
  self.routeProbeNodeId = nil;
  self.routeGatewayNodeId = nil;
  self.routeMode = 1;
  self.routePayload = nil;
  self.routeConfigPeripheral = nil;
  self.routeThreadDebugCharacteristic = nil;
  self.routeShouldReadThreadDebug = NO;

  if (errorCode != nil) {
    if (reject != nil) reject(errorCode, message ?: @"ARC BLE route configuration failed.", nil);
  } else {
    if (probeNodeId != nil && routeWrite) {
      [self emitDebug:probeNodeId message:@"ARC route-set 0x52 written to Probe BLE."];
      [self recordTelemetryRouteForProbe:probeNodeId gatewayNodeId:gatewayNodeId routeMode:routeMode];
    }
    if (resolve != nil) resolve(result ?: [NSNull null]);
  }
}

- (int16_t)readInt16LE:(const uint8_t *)bytes
{
  uint16_t raw = (uint16_t)bytes[0] | ((uint16_t)bytes[1] << 8);
  return (int16_t)raw;
}

- (void)parseEnvCharacteristicData:(NSData *)data
{
  if (data.length < 6) {
    return;
  }

  self.probeEnvData = data;

  const uint8_t *bytes = data.bytes;
  if (data.length >= 64 && bytes[2] == 0xE4u) {
    int16_t shtTempX100 = [self readInt16LE:&bytes[30]];
    uint16_t shtRhX100 = (uint16_t)bytes[32] | ((uint16_t)bytes[33] << 8);
    int16_t bmeTempX100 = [self readInt16LE:&bytes[52]];
    uint16_t bmeRhX100 = (uint16_t)bytes[58] | ((uint16_t)bytes[59] << 8);
    self.airTempC = (double)(bmeTempX100 != 0 ? bmeTempX100 : shtTempX100) / 100.0;
    self.humidityRh = (double)(bmeRhX100 != 0 ? bmeRhX100 : shtRhX100) / 100.0;
  } else {
    int16_t humidityX10 = [self readInt16LE:&bytes[2]];
    int16_t temperatureX10 = [self readInt16LE:&bytes[4]];
    self.humidityRh = (double)humidityX10 / 10.0;
    self.airTempC = (double)temperatureX10 / 10.0;
  }
  if (self.telemetryNodeId != nil) {
    [self emitTelemetryForNode:self.telemetryNodeId];
    // The one-second telemetry timer must not turn one cached ENV notification
    // into an endless stream of duplicate Probe samples.
    self.probeEnvData = nil;
  }
}

- (void)parseGatewayCharacteristicData:(NSData *)data
{
  if (data.length == 0 || self.telemetryNodeId == nil || !self.hasListeners) {
    return;
  }

  const uint8_t *bytes = data.bytes;
  if (bytes != NULL && (bytes[0] == 0x51u || bytes[0] == 0x56u || bytes[0] == 0x57u)) {
    [self emitDebug:self.telemetryNodeId message:[NSString stringWithFormat:
      @"[LampRoute][RX] opcode=0x%02X len=%lu", bytes[0], (unsigned long)data.length]];
  }
  NSString *payloadBase64 = [data base64EncodedStringWithOptions:0];
  [self sendEventWithName:@"MeshTelemetry" body:@{ @"nodeId": self.telemetryNodeId, @"payloadBase64": payloadBase64 }];
}

- (void)ensureCentralManager
{
  if (self.centralManager == nil) {
    self.centralManager = [[CBCentralManager alloc] initWithDelegate:self queue:dispatch_get_main_queue()];
  }
}

- (NSString *)bluetoothStateMessage
{
  switch (self.centralManager.state) {
    case CBManagerStatePoweredOn:
      return @"Bluetooth is powered on.";
    case CBManagerStatePoweredOff:
      return @"Bluetooth is powered off.";
    case CBManagerStateUnauthorized:
      return @"Bluetooth permission is not authorized.";
    case CBManagerStateUnsupported:
      return @"Bluetooth LE is not supported on this device.";
    case CBManagerStateResetting:
      return @"Bluetooth is resetting.";
    case CBManagerStateUnknown:
    default:
      return @"Bluetooth is not ready yet.";
  }
}

- (void)emitDebug:(NSString *)nodeId message:(NSString *)message
{
  if (!self.hasListeners) {
    return;
  }

  NSMutableDictionary *body = [@{ @"message": message } mutableCopy];
  if (nodeId != nil) {
    body[@"nodeId"] = nodeId;
  }
  [self sendEventWithName:@"MeshProvisioningDebug" body:body];
}

- (void)finishScan
{
  if (self.scanResolve == nil) {
    return;
  }

  [self.centralManager stopScan];

  NSArray *results = [self.scanResults.allValues sortedArrayUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) {
    NSString *leftName = left[@"name"] ?: @"";
    NSString *rightName = right[@"name"] ?: @"";
    return [leftName compare:rightName];
  }];

  RCTPromiseResolveBlock resolve = self.scanResolve;
  self.scanResolve = nil;
  self.scanReject = nil;
  resolve(results);
}

- (void)centralManagerDidUpdateState:(CBCentralManager *)central
{
  if (central.state == CBManagerStatePoweredOn) {
    if (self.requestedTelemetryNodeId.length > 0) {
      NSString *nodeId = self.requestedTelemetryNodeId;
      CBPeripheral *peripheral = [self restorePeripheralForNodeId:nodeId];
      if (peripheral != nil) {
        [self emitDebug:nodeId message:@"[TelemetryReconnect] Bluetooth ready; restoring requested telemetry owner."];
        [self startTelemetryForNode:nodeId];
      }
    }
    return;
  }

  if (self.scanReject == nil) {
    return;
  }

  RCTPromiseRejectBlock reject = self.scanReject;
  self.scanResolve = nil;
  self.scanReject = nil;
  [central stopScan];
  reject(@"BLUETOOTH_NOT_READY", [self bluetoothStateMessage], nil);
}

- (void)centralManager:(CBCentralManager *)central
 didDiscoverPeripheral:(CBPeripheral *)peripheral
     advertisementData:(NSDictionary<NSString *, id> *)advertisementData
                  RSSI:(NSNumber *)RSSI
{
  NSDictionary<CBUUID *, NSData *> *serviceData = advertisementData[CBAdvertisementDataServiceDataKey];
  NSData *provisioningData = serviceData[[CBUUID UUIDWithString:@"1827"]];
  NSData *proxyData = serviceData[[CBUUID UUIDWithString:@"1828"]];
  NSArray<CBUUID *> *serviceUuids = advertisementData[CBAdvertisementDataServiceUUIDsKey];
  NSString *localName = advertisementData[CBAdvertisementDataLocalNameKey];
  NSString *cachedName = peripheral.name;
  NSString *name = localName ?: cachedName ?: @"ARC Device";

  if (![self isArcLocalRoleAdvertisementName:name]) {
    return;
  }

  BOOL advertisesProvisioning = provisioningData != nil || [self serviceUuids:serviceUuids contains:[CBUUID UUIDWithString:@"1827"]];
  BOOL advertisesProxy = proxyData != nil || [self serviceUuids:serviceUuids contains:[CBUUID UUIDWithString:@"1828"]];
  BOOL arcLocalRoleAdvertised = [self isArcLocalRoleAdvertisementName:name];

  NSString *idValue = peripheral.identifier.UUIDString;

  NSMutableDictionary *result = [@{
    @"id": idValue,
    @"name": name,
    @"rssi": RSSI ?: @0,
    @"meshProvisioningAdvertised": @(advertisesProvisioning),
    @"meshProxyAdvertised": @(advertisesProxy),
    @"arcLocalRoleAdvertised": @(arcLocalRoleAdvertised)
  } mutableCopy];

  if (localName.length > 0) {
    result[@"localName"] = localName;
  }
  if (cachedName.length > 0) {
    result[@"cachedName"] = cachedName;
  }

  if (!advertisesProvisioning && [name hasPrefix:@"ARC_M"]) {
    result[@"detail"] = @"ARC device discovered by name; use ARC/Thread commissioning.";
  } else if (!advertisesProvisioning && [self isArcLocalRoleAdvertisementName:name]) {
    result[@"detail"] = @"ARC local-role device discovered over BLE. Use it as the app-facing route while Thread runs behind the Gateway/Probe role.";
  }


  self.scanResults[idValue] = result;
  self.discoveredPeripherals[idValue] = peripheral;
  NSString *peripheralId = peripheral.identifier.UUIDString;
  if (self.provisionedNodes[idValue] != nil) {
    self.provisionedPeripheralIds[idValue] = peripheralId;
    [[NSUserDefaults standardUserDefaults] setObject:self.provisionedPeripheralIds forKey:@"ARCProvisionedPeripheralIdsV1"];
  }
  for (NSString *provisionedNodeId in self.provisionedPeripheralIds) {
    if ([self.provisionedPeripheralIds[provisionedNodeId] isEqualToString:peripheralId]) {
      self.discoveredPeripherals[provisionedNodeId] = peripheral;
    }
  }

  if (self.requestedTelemetryNodeId.length > 0 &&
      self.discoveredPeripherals[self.requestedTelemetryNodeId] == peripheral &&
      peripheral != self.telemetryPeripheral) {
    [self emitDebug:self.requestedTelemetryNodeId message:@"[TelemetryReconnect] requested telemetry owner rediscovered during scan."];
    [self startTelemetryForNode:self.requestedTelemetryNodeId];
  }
}

- (void)centralManager:(CBCentralManager *)central didConnectPeripheral:(CBPeripheral *)peripheral
{
  if (peripheral == self.routeConfigPeripheral) {
    peripheral.delegate = self;
    [peripheral discoverServices:@[[self bleSensorServiceUUID]]];
  }

  if (peripheral == self.telemetryPeripheral) {
    [self startTelemetryTimer];
    [self setNodeId:[self nodeIdForPeripheral:peripheral] physicallyConnected:YES];
    [self beginTelemetryDiscoveryForPeripheral:peripheral];
  }

  if (peripheral == self.provisioningPeripheral) {
    [self finishProvisioningLinkOpen];
  }
}

- (void)centralManager:(CBCentralManager *)central didFailToConnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error
{
  if (peripheral == self.routeConfigPeripheral) {
    [self finishRouteConfigWithResult:nil errorCode:@"ROUTE_CONFIG_CONNECT_FAILED" message:error.localizedDescription ?: @"Failed to connect to Probe for ARC route-set write."];
  }

  if (peripheral == self.telemetryPeripheral) {
    [self.telemetryTimer invalidate];
    self.telemetryTimer = nil;
    [self setNodeId:[self nodeIdForPeripheral:peripheral] physicallyConnected:NO];
    [self emitDebug:self.telemetryNodeId message:@"ARC physical BLE connection failed; node remains offline."];
  }

  if (peripheral != self.provisioningPeripheral || self.linkReject == nil) {
    return;
  }

  RCTPromiseRejectBlock reject = self.linkReject;
  NSString *message = error.localizedDescription ?: @"Failed to connect to scanned ARC candidate.";
  [self clearProvisioningLinkPromise];
  reject(@"LINK_FAILED", message, error);
}

- (void)centralManager:(CBCentralManager *)central didDisconnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error
{
  if (peripheral == self.telemetryPeripheral) {
    NSString *telemetryNodeId = [self nodeIdForPeripheral:peripheral];
    [self.telemetryTimer invalidate];
    self.telemetryTimer = nil;
    self.telemetryEnvCharacteristic = nil;
    self.telemetryGatewayCharacteristic = nil;
    self.telemetryRssi = nil;
    self.probeEnvData = nil;
    [self setNodeId:telemetryNodeId physicallyConnected:NO];
    [self emitDebug:telemetryNodeId message:@"ARC physical BLE link disconnected; retained as a known offline node."];
  }

  if (peripheral != self.provisioningPeripheral) {
    return;
  }

  NSString *nodeId = self.linkNodeId;
  self.provisioningPeripheral = nil;
  if (self.hasListeners && nodeId != nil) {
    [self sendEventWithName:@"MeshConnection" body:@{ @"nodeId": nodeId, @"connected": @NO }];
  }
}

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverServices:(NSError *)error
{
  if (error != nil) {
    if (peripheral == self.routeConfigPeripheral) {
      [self finishRouteConfigWithResult:nil errorCode:@"ROUTE_CONFIG_SERVICE_FAILED" message:error.localizedDescription ?: @"Failed to discover Probe BLE service."];
    }
    if (peripheral == self.telemetryPeripheral) {
      [self emitDebug:self.telemetryNodeId message:[NSString stringWithFormat:
        @"[TelemetrySubscribe][SERVICE_FAIL] %@", error.localizedDescription ?: @"unknown CoreBluetooth error"]];
    }
    return;
  }

  if (peripheral == self.routeConfigPeripheral) {
    CBUUID *loaderRxUuid = [self bleSensorLoaderRxCharacteristicUUID];
    CBUUID *threadDebugUuid = [self bleSensorThreadDebugCharacteristicUUID];
    for (CBService *service in peripheral.services) {
      if ([service.UUID isEqual:[self bleSensorServiceUUID]]) {
        NSArray<CBUUID *> *characteristics = self.routeShouldReadThreadDebug
          ? @[loaderRxUuid, threadDebugUuid]
          : @[loaderRxUuid];
        [peripheral discoverCharacteristics:characteristics forService:service];
        return;
      }
    }
    [self finishRouteConfigWithResult:nil errorCode:@"ROUTE_CONFIG_SERVICE_MISSING" message:@"Probe BLE Sensor service not found for ARC route-set write."];
    return;
  }

  if (peripheral != self.telemetryPeripheral) {
    return;
  }

  CBUUID *envUuid = [self bleSensorEnvCharacteristicUUID];
  CBUUID *gatewayUuid = [self bleSensorLoaderTxCharacteristicUUID];
  for (CBService *service in peripheral.services) {
    if ([service.UUID isEqual:[self bleSensorServiceUUID]]) {
      [peripheral discoverCharacteristics:@[envUuid, gatewayUuid] forService:service];
      return;
    }
  }
  [self emitDebug:self.telemetryNodeId message:@"[TelemetrySubscribe][SERVICE_MISSING] BLE Sensor service was not discovered."];
}

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverCharacteristicsForService:(CBService *)service error:(NSError *)error
{
  if (error != nil) {
    if (peripheral == self.routeConfigPeripheral) {
      [self finishRouteConfigWithResult:nil errorCode:@"ROUTE_CONFIG_CHAR_FAILED" message:error.localizedDescription ?: @"Failed to discover Probe Loader RX characteristic."];
    }
    if (peripheral == self.telemetryPeripheral) {
      [self emitDebug:self.telemetryNodeId message:[NSString stringWithFormat:
        @"[TelemetrySubscribe][CHAR_FAIL] %@", error.localizedDescription ?: @"unknown CoreBluetooth error"]];
    }
    return;
  }

  if (peripheral == self.routeConfigPeripheral) {
    CBUUID *loaderRxUuid = [self bleSensorLoaderRxCharacteristicUUID];
    CBUUID *threadDebugUuid = [self bleSensorThreadDebugCharacteristicUUID];
    CBCharacteristic *loaderRxCharacteristic = nil;
    for (CBCharacteristic *characteristic in service.characteristics) {
      if ([characteristic.UUID isEqual:loaderRxUuid]) loaderRxCharacteristic = characteristic;
      if ([characteristic.UUID isEqual:threadDebugUuid]) self.routeThreadDebugCharacteristic = characteristic;
    }
    if (loaderRxCharacteristic != nil) {
      CBCharacteristicWriteType writeType = (loaderRxCharacteristic.properties & CBCharacteristicPropertyWrite) != 0 ? CBCharacteristicWriteWithResponse : CBCharacteristicWriteWithoutResponse;
      [peripheral writeValue:self.routePayload forCharacteristic:loaderRxCharacteristic type:writeType];
      if (writeType == CBCharacteristicWriteWithoutResponse) {
        [self readRouteThreadDebugOrFinish];
      }
      return;
    }
    NSMutableArray<NSString *> *uuids = [NSMutableArray new];
    for (CBCharacteristic *characteristic in service.characteristics) {
      [uuids addObject:characteristic.UUID.UUIDString];
    }
    NSString *message = [NSString stringWithFormat:@"Probe Loader RX characteristic not found for ARC route-set write. Discovered: %@", [uuids componentsJoinedByString:@", "]];
    [self finishRouteConfigWithResult:nil errorCode:@"ROUTE_CONFIG_CHAR_MISSING" message:message];
    return;
  }

  if (peripheral != self.telemetryPeripheral) {
    return;
  }

  CBUUID *envUuid = [self bleSensorEnvCharacteristicUUID];
  CBUUID *gatewayUuid = [self bleSensorLoaderTxCharacteristicUUID];
  BOOL subscribedEnv = NO;
  BOOL subscribedGateway = NO;

  for (CBCharacteristic *characteristic in service.characteristics) {
    if ([characteristic.UUID isEqual:envUuid]) {
      self.telemetryEnvCharacteristic = characteristic;
      [peripheral readValueForCharacteristic:characteristic];
      if ((characteristic.properties & CBCharacteristicPropertyNotify) != 0) {
        [peripheral setNotifyValue:YES forCharacteristic:characteristic];
      }
      subscribedEnv = YES;
    } else if ([characteristic.UUID isEqual:gatewayUuid]) {
      self.telemetryGatewayCharacteristic = characteristic;
      self.telemetryDiscoveryAttempt = 0;
      [peripheral readValueForCharacteristic:characteristic];
      if ((characteristic.properties & CBCharacteristicPropertyNotify) != 0) {
        [peripheral setNotifyValue:YES forCharacteristic:characteristic];
      }
      subscribedGateway = YES;
    }
  }

  if (subscribedEnv && subscribedGateway) {
    [self emitDebug:self.telemetryNodeId message:@"[TelemetrySubscribe][OK] subscribed to ENV and Loader TX."];
  } else if (subscribedEnv) {
    [self emitDebug:self.telemetryNodeId message:@"Subscribed to WBA5 Probe ENV characteristic for live sensor telemetry."];
  } else if (subscribedGateway) {
    [self emitDebug:self.telemetryNodeId message:@"Subscribed to ARC Gateway app route characteristic for Thread-routed telemetry."];
  } else {
    NSMutableArray<NSString *> *uuids = [NSMutableArray new];
    for (CBCharacteristic *characteristic in service.characteristics) {
      [uuids addObject:characteristic.UUID.UUIDString];
    }
    [self emitDebug:self.telemetryNodeId message:[NSString stringWithFormat:
      @"[TelemetrySubscribe][CHAR_MISSING] discovered=%@", [uuids componentsJoinedByString:@","]]];
  }
}

- (void)peripheral:(CBPeripheral *)peripheral didUpdateValueForCharacteristic:(CBCharacteristic *)characteristic error:(NSError *)error
{
  if (peripheral == self.probeDiagnosticPeripheral &&
      characteristic == self.probeDiagnosticCharacteristic) {
    NSString *nodeId = self.probeDiagnosticNodeId;
    if (error == nil) {
      [self emitProbeThreadDebug:characteristic.value nodeId:nodeId];
    } else {
      [self emitDebug:nodeId message:[NSString stringWithFormat:
        @"[ProbeThread][FOLLOWUP_FAIL] %@", error.localizedDescription ?: @"unknown CoreBluetooth error"]];
    }
    self.probeDiagnosticPeripheral = nil;
    self.probeDiagnosticCharacteristic = nil;
    self.probeDiagnosticNodeId = nil;
    if (peripheral != self.telemetryPeripheral && peripheral != self.provisioningPeripheral &&
        peripheral.state == CBPeripheralStateConnected) {
      [self.centralManager cancelPeripheralConnection:peripheral];
    }
    return;
  }
  if (peripheral == self.routeConfigPeripheral &&
      [characteristic.UUID isEqual:[self bleSensorThreadDebugCharacteristicUUID]]) {
    if (error == nil) [self emitProbeThreadDebug:characteristic.value nodeId:self.routeProbeNodeId];
    [self finishSuccessfulRouteConfig];
    return;
  }
  if (peripheral != self.telemetryPeripheral || error != nil) {
    return;
  }

  if ([characteristic.UUID isEqual:[self bleSensorEnvCharacteristicUUID]]) {
    [self parseEnvCharacteristicData:characteristic.value];
  } else if ([characteristic.UUID isEqual:[self bleSensorLoaderTxCharacteristicUUID]]) {
    [self parseGatewayCharacteristicData:characteristic.value];
  }
}

- (void)peripheral:(CBPeripheral *)peripheral
didUpdateNotificationStateForCharacteristic:(CBCharacteristic *)characteristic
              error:(NSError *)error
{
  if (peripheral != self.telemetryPeripheral) return;
  if (![characteristic.UUID isEqual:[self bleSensorEnvCharacteristicUUID]] &&
      ![characteristic.UUID isEqual:[self bleSensorLoaderTxCharacteristicUUID]]) return;

  NSString *channel = [characteristic.UUID isEqual:[self bleSensorLoaderTxCharacteristicUUID]]
    ? @"LoaderTX"
    : @"ENV";
  if (error != nil) {
    [self emitDebug:self.telemetryNodeId message:[NSString stringWithFormat:
      @"[TelemetrySubscribe][NOTIFY_FAIL] channel=%@ error=%@", channel,
      error.localizedDescription ?: @"unknown CoreBluetooth error"]];
  } else {
    [self emitDebug:self.telemetryNodeId message:[NSString stringWithFormat:
      @"[TelemetrySubscribe][NOTIFY] channel=%@ enabled=%@", channel,
      characteristic.isNotifying ? @"1" : @"0"]];
  }
}

- (void)peripheral:(CBPeripheral *)peripheral didWriteValueForCharacteristic:(CBCharacteristic *)characteristic error:(NSError *)error
{
  if (peripheral != self.routeConfigPeripheral || ![characteristic.UUID isEqual:[self bleSensorLoaderRxCharacteristicUUID]]) {
    return;
  }

  if (error != nil) {
    [self finishRouteConfigWithResult:nil errorCode:@"ROUTE_CONFIG_WRITE_FAILED" message:error.localizedDescription ?: @"Probe rejected ARC route-set write."];
    return;
  }

  [self readRouteThreadDebugOrFinish];
}

- (void)peripheral:(CBPeripheral *)peripheral didReadRSSI:(NSNumber *)RSSI error:(NSError *)error
{
  if (peripheral != self.telemetryPeripheral || error != nil) {
    return;
  }

  self.telemetryRssi = RSSI;
}

- (void)finishProvisioningLinkOpen
{
  if (self.linkResolve == nil) {
    return;
  }

  NSString *nodeId = self.linkNodeId;
  [self emitDebug:nodeId message:@"GATT link open for ARC commissioning."];
  if (self.hasListeners && nodeId != nil) {
    [self sendEventWithName:@"MeshConnection" body:@{ @"nodeId": nodeId, @"connected": @YES }];
    [self sendEventWithName:@"MeshProvisioningState" body:@{ @"nodeId": nodeId, @"state": @"PB_GATT_LINK_OPEN" }];
  }

  RCTPromiseResolveBlock resolve = self.linkResolve;
  [self clearProvisioningLinkPromise];
  resolve([NSNull null]);
}

- (void)clearProvisioningLinkPromise
{
  self.linkResolve = nil;
  self.linkReject = nil;
  self.linkNodeId = nil;
}

- (BOOL)isMeshProvisioningAdvertisementWithName:(NSString *)name
                                    serviceData:(NSDictionary<CBUUID *, NSData *> *)serviceData
                                   serviceUuids:(NSArray<CBUUID *> *)serviceUuids
{
  CBUUID *provisioningService = [CBUUID UUIDWithString:@"1827"];
  if (serviceData[provisioningService] != nil) {
    return YES;
  }

  if ([self serviceUuids:serviceUuids contains:provisioningService]) {
    return YES;
  }

  return [name hasPrefix:@"ARC_M"] || [self isArcLocalRoleAdvertisementName:name];
}

- (BOOL)isArcLocalRoleAdvertisementName:(NSString *)name
{
  return [name hasPrefix:@"ARC Gateway"] ||
         [name hasPrefix:@"ARC Probe"] ||
         [name hasPrefix:@"ARC Lamp"] ||
         [name isEqualToString:@"ARC_R"] ||
         [name isEqualToString:@"ARC_T"];
}

- (BOOL)serviceUuids:(NSArray<CBUUID *> *)serviceUuids contains:(CBUUID *)targetUuid
{
  for (CBUUID *uuid in serviceUuids) {
    if ([uuid isEqual:targetUuid]) {
      return YES;
    }
  }
  return NO;
}

- (NSString *)meshUuidFromServiceData:(NSData *)serviceData
{
  if (serviceData.length < 16) {
    return nil;
  }

  const unsigned char *bytes = serviceData.bytes;
  return [NSString stringWithFormat:@"%02X%02X%02X%02X-%02X%02X-%02X%02X-%02X%02X-%02X%02X%02X%02X%02X%02X",
          bytes[0], bytes[1], bytes[2], bytes[3],
          bytes[4], bytes[5],
          bytes[6], bytes[7],
          bytes[8], bytes[9],
          bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]];
}

@end
