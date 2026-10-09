/**
 ******************************************************************************
 * @file    STHeartbeatModel.h
 * @author  ST BLE Mesh Team
 * @version V1.03.000
 * @date    25-September-2018
 * @brief   Implementation of Heartbeat functionality.
 ******************************************************************************
 * @attention
 *
 * <h2><center>&copy; COPYRIGHT(c) 2019 STMicroelectronics</center></h2>
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *   1. Redistributions of source code must retain the above copyright notice,
 *      this list of conditions and the following disclaimer.
 *   2. Redistributions in binary form must reproduce the above copyright notice,
 *      this list of conditions and the following disclaimer in the documentation
 *      and/or other materials provided with the distribution.
 *   3. Neither the name of STMicroelectronics nor the names of its contributors
 *      may be used to endorse or promote products derived from this software
 *      without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 ******************************************************************************
 */

#import <Foundation/Foundation.h>
#import "STMeshBasicTypes.h"

@protocol STMeshHeartBeatModelDelegate;
@interface STMeshHeartbeatModel : NSObject


/**
 * @brief HeartbeatPublicationGet Method. PeerAddress is the only parameter required.
 * @discussion This function will get the heartbeat publication for the mentioned node address.
 * @param  peerAddress Peer Address
 * @code
    STMeshStatus * objSTMeshStatus = [self heartbeatPublicationGet:3]
 * @endcode
 * @return Enum STMeshStatus corresponding value.
 * @remarks Parameter is uint16_t datatype.
 */
-(STMeshStatus)heartbeatPublicationGet:(uint16_t)peerAddress;

/**
 * @brief HeartbeatPublicationSet Method. It needs peerAddress , destinationAddress, countLog, periodLog, TTL, features, netKeyIndex parameters.
 * @discussion This function will set the heartbeat publication for the mentioned node address.
 * @param1 peerAddress Peer Address.
 * @param2 destinationAddress Destination Address.
 * @param3 countLog i.e Number of Heartbeat messages to be sent.
 * @param4 periodLog i.e Period for sending Heartbeat messages.
 * @param5 TTL i.e TTL to be used when sending Heartbeat messages.
 * @param6 features i.e Bit field indicating features that trigger Heartbeat messages when changed.
 * @param7 netkeyIndex i.e Index used for NetKey.
 * @code
    For ex: STMeshStatus *status = [self heartbeatPublicationSet:2 destinationAddress:3 countLog:4  periodLog:5  TTL:5 features:0  netKeyIndex:0]
 * @endcode
 * @return Enum STMeshStatus corresponding value.
 * @remarks countLog, periodLog, TTL are uint8_t datatype, rest all are uint16_t datatype.
 */
-(STMeshStatus)heartbeatPublicationSet:(uint16_t) peerAddress destinationAddress:(uint16_t) destinationAddress countLog:(uint8_t)countLog  periodLog:(uint8_t)periodLog  TTL:(uint8_t)TTL features:(uint16_t)features  netKeyIndex:(uint16_t)netkeyIndex;


/**
 @brief HeartbeatSubscriptionGet Method. PeerAddress is the only parameter required.
 @discussion This function will get the heartbeat Subscription for the mentioned node address.
 @param  peerAddress Peer Address
 @code
    STMeshStatus * objSTMeshStatus = [self heartbeatSubscriptionGet:3]
 @endcode
 @return Enum STMeshStatus corresponding value.
 @remarks Parameter is uint16_t datatype.
 */
-(STMeshStatus)heartbeatSubscriptionGet:(uint16_t) peerAddress;

/**
 * @brief HeartbeatSubscriptionSet Method. It needs peerAddress, sourceAddress , destinationAddress, periodLog parameters.
 * @discussion This function will set the subscription for the mentioned node address.
 * @param1 peerAddress Peer Address
 * @param2 sourceAddress i.e Source Address for Heartbeat messages
 * @param3 destinationAddress i.e Destination address for Heartbeat messages
 * @param4 periodLog i.e Period for receiving Heartbeat messages
 * @code
    For ex: STMeshStatus *status = [self heartbeatSubscriptionSet:2 sourceAddress:2 destinationAddress:3 periodLog:5]
 * @endcode
 * @return Enum STMeshStatus corresponding value.
 * @remarks  periodLog is uint8_t datatype, rest all are uint16_t datatype.
 */
-(STMeshStatus)heartbeatSubscriptionSet:(uint16_t) peerAddress sourceAddress:(uint16_t )sourceAddress destinationAddress:(uint16_t )destinationAddress  periodLog:(uint8_t) periodLog;


@property(weak , nonatomic) id<STMeshHeartBeatModelDelegate> delegate;
@end
@protocol STMeshHeartBeatModelDelegate <NSObject>

/**
 * @brief Status of the heartbeatPublicationGet.
 * @discussion This callback is invoked to report status of heartbeatPublication Get/Set function.
 * @param1 peerAddress Peer Address.
 * @param2 destinationAddress Destination Address.
 * @param3 countLog i.e Number of Heartbeat messages to be sent.
 * @param4 periodLog i.e Period for sending Heartbeat messages.
 * @param5 TTL i.e TTL to be used when sending Heartbeat messages.
 * @param6 features i.e Bit field indicating features that trigger Heartbeat messages when changed.
 * @param7 netKeyIndex i.e Index used for NetKey.
 * @remarks This needs to be implemented in order to get the response of the Heartbeat Set Publication command.
 */
-(void) heartbeatModel:(STMeshHeartbeatModel *)heartbeatModel didRecieveHeartbeatPublicationsStatusFromAddress:(uint16_t)peerAddress statusCode:(uint8_t)status destinationAddress:(uint16_t)destinationAddress countLog:(uint8_t)countLog periodLog:(uint8_t)periodLog TTL:(uint8_t)TTL features:(uint16_t)features netKeyIndex:(uint16_t)netKeyIndex;


/**
 * @brief Status of the heartbeatSubscriptionGet.
 * @discussion This callback is invoked to report status of heartbeatSubscription Get/Set function.
 * @param1 peerAddress Peer Address.
 * @param2 destinationAddress Destination Address.
 * @param3 countLog i.e Number of Heartbeat messages to be sent.
 * @param4 periodLog i.e Period for sending Heartbeat messages.
 * @param5 minHops i.e Min path required to reach desired node.
 * @param6 maxHops i.e Max path required to reach desired node.
 * @remarks This needs to be implemented in order to get the response of the Heartbeat Set Subcscription command
 */
-(void) heartbeatModel:(STMeshHeartbeatModel *)heartbeatModel didRecieveHeartbeatSubscriptionStatusFromAddress:(uint16_t)peerAddress statusCode:(uint8_t)status destinationAddress:(uint16_t)destinationAddress  periodLog:(uint8_t)periodLog countLog:(uint8_t)countLog minHops:(uint8_t)minHops maxHops:(uint8_t)maxHops;

@end
