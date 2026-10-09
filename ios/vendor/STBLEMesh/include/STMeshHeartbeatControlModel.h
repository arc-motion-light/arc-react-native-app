/**
 ******************************************************************************
 * @file    STMeshHeartbeatControlModel.h
 * @author  ST BLE Mesh Team
 * @version V1.03.000
 * @date    03-September-2018
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
@protocol STMeshHeartbeatControlMessageProtocol;
@interface STMeshHeartbeatControlModel : NSObject



@property(weak , nonatomic) id<STMeshHeartbeatControlMessageProtocol> delegate;
@end
@protocol STMeshHeartbeatControlMessageProtocol <NSObject>
/* This callback is called when Heartbeat is received from the  node. */

/*!
 * @brief The Heartbeat message is sent by a node to let other nodes determine topology of a subne
 * @discussion The Heartbeat message can be used for two main functions. The first function is the determination that a node is still active within a mesh network. The second function is the determination of how far a node is away.
 * @param1 peerAddress Address of  the node.
 * @param2 RFU Reserved for Future Use.
 * @param3 intialTTL Initial TTL used when sending the message.
 * @param4 finalTTL Final TTL used when sending the message.
 * @param5 isRelay Relay feature in use: 0 = False, 1 = True.
 * @param6 isProxy Proxy feature in use: 0 = False, 1 = True.
 * @param7 isFriendshipSupports Friend feature in use: 0 = False, 1 = True.
 * @param8 isLowPowerSupports Low Power feature in use: 0 = False, 1 = True.
 */
-(void) heartbeatControlModel:(STMeshHeartbeatControlModel *)heartbeatModel peerAddress:(uint16_t)peerAddress reservedForFutureUse:(uint8_t)RFU intialTTL:(uint8_t)intialTTL finalTTL:(uint8_t)finalTTL isRelay:(bool)isRelay isProxy:(bool)isProxy isFriendshipSupports:(bool)isFriendshipSupports isLowPowerSupports:(bool)isLowPowerSupports;

@end
